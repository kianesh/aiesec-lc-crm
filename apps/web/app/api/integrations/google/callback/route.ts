import { schema } from "@aiesec/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../../lib/db";
import { exchangeGoogleCode, getGoogleUserInfo } from "../../../../../lib/connectors/google";
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

  if (oauthError) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(oauthError)}`, site));
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/integrations?error=google_missing_code", site));

  const state = verifyState(stateRaw);
  if (!state) return NextResponse.redirect(new URL("/integrations?error=google_bad_state", site));

  try {
    const redirectUri = `${site}/api/integrations/google/callback`;
    const creds = await exchangeGoogleCode(code, redirectUri);
    const info = await getGoogleUserInfo(creds.access_token);

    const db = getDb();
    await saveIntegration(db, state.lcId, "google_drive", creds as unknown as Record<string, unknown>, {
      email: info.email ?? null,
      name: info.name ?? null,
      scope: creds.scope ?? null,
      connectedAt: new Date().toISOString()
    });

    await db.insert(schema.auditLog).values({
      lcId: state.lcId,
      userId: state.userId,
      action: "integration.google.connected",
      entityType: "integration",
      metadata: { provider: "google_drive", email: info.email }
    });

    return NextResponse.redirect(new URL("/integrations?saved=google", site));
  } catch (err) {
    const message = err instanceof Error ? err.message : "google_connect_failed";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(message)}`, site));
  }
}
