import { NextResponse, type NextRequest } from "next/server";
import { getAssistantSession } from "../../../../../lib/assistant/auth";
import { getNotionAuthUrl, notionConfigured } from "../../../../../lib/connectors/notion";
import { signState } from "../../../../../lib/connectors/oauth-state";
import { getSiteUrl } from "../../../../../lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  if (!notionConfigured()) {
    return NextResponse.redirect(new URL("/integrations/notion?error=notion_not_configured", getSiteUrl()));
  }
  const session = await getAssistantSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", getSiteUrl()));
  if (session.membership.role === "member") {
    return NextResponse.redirect(new URL("/integrations/notion?error=not_allowed", getSiteUrl()));
  }

  const redirectUri = `${getSiteUrl()}/api/integrations/notion/callback`;
  const state = signState(session.membership.lcId, session.userId);
  return NextResponse.redirect(getNotionAuthUrl(state, redirectUri));
}
