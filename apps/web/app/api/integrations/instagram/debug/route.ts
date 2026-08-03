import { NextResponse, type NextRequest } from "next/server";
import { getAssistantSession } from "../../../../../lib/assistant/auth";
import { getInstagramAuth } from "../../../../../lib/connectors/instagram";
import { readIntegration } from "../../../../../lib/connectors/store";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.instagram.com/v21.0";

/**
 * Read-only diagnostic for the Instagram connection.
 *
 * "Synced — 0 record(s)" is ambiguous: an empty inbox, a token missing the
 * messaging scope, and an API error that got swallowed all look identical from
 * the integrations page. This calls Instagram with the stored token and reports
 * exactly what came back.
 *
 * Never returns the access token. Owners/admins only.
 */
async function probe(url: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "request failed" };
  }
}

export async function GET(_request: NextRequest) {
  const session = await getAssistantSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.membership.role === "member") {
    return NextResponse.json({ error: "Owners and admins only." }, { status: 403 });
  }

  const db = getDb();
  const lcId = session.membership.lcId;

  const stored = await readIntegration<{ access_token?: string; user_id?: string; expiry_date?: number }>(
    db,
    lcId,
    "meta"
  );
  if (!stored) return NextResponse.json({ error: "Instagram is not connected for this LC." }, { status: 404 });

  let token: string;
  let igUserId: string;
  try {
    ({ token, igUserId } = await getInstagramAuth(db, lcId));
  } catch (error) {
    return NextResponse.json(
      { stage: "getInstagramAuth", error: error instanceof Error ? error.message : "unknown" },
      { status: 200 }
    );
  }

  const expiry = stored.creds?.expiry_date ?? null;

  // `me` confirms the token works at all. `me/conversations` is the call the
  // sync makes. The third is the same call without the platform param, since
  // that param belongs to the Facebook-login flavour of the API and may be
  // what is filtering everything out here.
  const [me, conversations, conversationsNoPlatform] = await Promise.all([
    probe(`${GRAPH}/me?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`),
    probe(
      `${GRAPH}/me/conversations?platform=instagram&fields=participants,messages.limit(1){id,created_time}&access_token=${encodeURIComponent(token)}`
    ),
    probe(
      `${GRAPH}/me/conversations?fields=participants,messages.limit(1){id,created_time}&access_token=${encodeURIComponent(token)}`
    )
  ]);

  return NextResponse.json(
    {
      storedIgUserId: igUserId,
      // Whether the id we compare participants against is the same one the
      // /me call reports; a mismatch silently misidentifies every participant.
      meIdMatchesStored:
        typeof me.body === "object" && me.body !== null && "id" in me.body
          ? String((me.body as { id: unknown }).id) === String(igUserId)
          : null,
      tokenExpiresAt: expiry ? new Date(expiry).toISOString() : null,
      tokenExpired: expiry ? expiry < Date.now() : null,
      probes: { me, conversations, conversationsNoPlatform }
    },
    { status: 200 }
  );
}
