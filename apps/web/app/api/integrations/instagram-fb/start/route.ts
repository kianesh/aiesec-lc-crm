import { NextResponse, type NextRequest } from "next/server";
import { getAssistantSession } from "../../../../../lib/assistant/auth";
import { facebookLoginConfigured, getFacebookAuthUrl } from "../../../../../lib/connectors/instagram-fb";
import { signState } from "../../../../../lib/connectors/oauth-state";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const site = getSiteUrl();

  if (!facebookLoginConfigured()) {
    return NextResponse.redirect(
      new URL("/integrations/instagram?error=facebook_not_configured", site)
    );
  }

  const session = await getAssistantSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", site));
  if (session.membership.role === "member") {
    return NextResponse.redirect(new URL("/integrations/instagram?error=not_allowed", site));
  }

  const redirectUri = `${site}/api/integrations/instagram-fb/callback`;
  const state = signState(session.membership.lcId, session.userId);
  return NextResponse.redirect(getFacebookAuthUrl(state, redirectUri));
}
