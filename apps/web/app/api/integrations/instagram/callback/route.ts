import { schema } from "@aiesec/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../../lib/db";
import { exchangeInstagramCode, getInstagramProfile } from "../../../../../lib/connectors/instagram";
import { verifyState } from "../../../../../lib/connectors/oauth-state";
import { saveIntegration } from "../../../../../lib/connectors/store";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) return NextResponse.redirect(new URL(`/integrations/instagram?error=${encodeURIComponent(oauthError)}`, site));
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/integrations/instagram?error=instagram_missing_code", site));

  const state = verifyState(stateRaw);
  if (!state) return NextResponse.redirect(new URL("/integrations/instagram?error=instagram_bad_state", site));

  try {
    // Instagram appends "#_" to the redirect; the code arrives clean via query.
    const redirectUri = `${site}/api/integrations/instagram/callback`;
    const creds = await exchangeInstagramCode(code, redirectUri);
    const profile = await getInstagramProfile(creds.access_token).catch(() => null);

    const db = getDb();
    await saveIntegration(db, state.lcId, "meta", creds as unknown as Record<string, unknown>, {
      igUserId: creds.user_id,
      username: profile?.username ?? null,
      platform: "instagram",
      connectedAt: new Date().toISOString()
    });

    await db.insert(schema.auditLog).values({
      lcId: state.lcId,
      userId: state.userId,
      action: "integration.instagram.connected",
      entityType: "integration",
      metadata: { provider: "meta", platform: "instagram", username: profile?.username }
    });

    return NextResponse.redirect(new URL("/integrations/instagram?saved=instagram", site));
  } catch (err) {
    const message = err instanceof Error ? err.message : "instagram_connect_failed";
    return NextResponse.redirect(new URL(`/integrations/instagram?error=${encodeURIComponent(message)}`, site));
  }
}
