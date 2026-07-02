import { NextResponse, type NextRequest } from "next/server";
import { getAssistantSession } from "../../../../../lib/assistant/auth";
import { getInstagramAuthUrl, instagramConfigured } from "../../../../../lib/connectors/instagram";
import { signState } from "../../../../../lib/connectors/oauth-state";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  if (!instagramConfigured()) {
    return NextResponse.redirect(new URL("/integrations?error=instagram_not_configured", getSiteUrl()));
  }
  const session = await getAssistantSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", getSiteUrl()));
  if (session.membership.role === "member") {
    return NextResponse.redirect(new URL("/integrations?error=not_allowed", getSiteUrl()));
  }

  const redirectUri = `${getSiteUrl()}/api/integrations/instagram/callback`;
  const state = signState(session.membership.lcId, session.userId);
  return NextResponse.redirect(getInstagramAuthUrl(state, redirectUri));
}
