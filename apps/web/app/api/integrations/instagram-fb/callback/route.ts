import { schema } from "@aiesec/db";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeFacebookCode,
  resolveInstagramPage,
  type FacebookIgCreds
} from "../../../../../lib/connectors/instagram-fb";
import { verifyState } from "../../../../../lib/connectors/oauth-state";
import { saveIntegration } from "../../../../../lib/connectors/store";
import { getDb } from "../../../../../lib/db";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/integrations/instagram?error=${encodeURIComponent(oauthError)}`, site)
    );
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL("/integrations/instagram?error=missing_code", site));
  }

  const state = verifyState(stateRaw);
  if (!state) return NextResponse.redirect(new URL("/integrations/instagram?error=bad_state", site));

  try {
    const redirectUri = `${site}/api/integrations/instagram-fb/callback`;
    const { userAccessToken, expiryDate } = await exchangeFacebookCode(code, redirectUri);
    const page = await resolveInstagramPage(userAccessToken);

    const creds: FacebookIgCreds = {
      page_access_token: page.pageAccessToken,
      page_id: page.pageId,
      ig_user_id: page.igUserId,
      user_access_token: userAccessToken,
      expiry_date: expiryDate
    };

    const db = getDb();
    // Stored under the same provider as the Instagram-Login connection, with a
    // flow marker so the sync knows which API to talk to. Connecting one way
    // replaces the other rather than leaving two half-working credentials.
    await saveIntegration(db, state.lcId, "meta", creds as unknown as Record<string, unknown>, {
      flow: "facebook",
      pageId: page.pageId,
      pageName: page.pageName,
      igUserId: page.igUserId,
      username: page.igUsername,
      platform: "instagram",
      connectedAt: new Date().toISOString()
    });

    await db.insert(schema.auditLog).values({
      lcId: state.lcId,
      userId: state.userId,
      action: "integration.instagram.connected",
      entityType: "integration",
      metadata: { provider: "meta", flow: "facebook", page: page.pageName, username: page.igUsername }
    });

    return NextResponse.redirect(new URL("/integrations/instagram?saved=instagram", site));
  } catch (error) {
    // resolveInstagramPage throws prose meant to be read — "no Page has an
    // Instagram account linked" is the likely failure and the user can act on
    // it, so pass it through rather than flattening it to a code.
    const message = error instanceof Error ? error.message : "facebook_connect_failed";
    return NextResponse.redirect(
      new URL(`/integrations/instagram?error=${encodeURIComponent(message)}`, site)
    );
  }
}
