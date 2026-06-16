import { NextResponse, type NextRequest } from "next/server";
import { getAssistantSession } from "../../../../../lib/assistant/auth";
import { googleConfigured, getGoogleAuthUrl } from "../../../../../lib/connectors/google";
import { signState } from "../../../../../lib/connectors/oauth-state";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/integrations?error=google_not_configured", getSiteUrl()));
  }
  const session = await getAssistantSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", getSiteUrl()));
  if (session.membership.role === "member") {
    return NextResponse.redirect(new URL("/integrations?error=not_allowed", getSiteUrl()));
  }

  const redirectUri = `${getSiteUrl()}/api/integrations/google/callback`;
  const state = signState(session.membership.lcId, session.userId);
  return NextResponse.redirect(getGoogleAuthUrl(state, redirectUri));
}
