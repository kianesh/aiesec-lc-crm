import { schema } from "@aiesec/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../../lib/db";
import { exchangeNotionCode, findFirstDatabase } from "../../../../../lib/connectors/notion";
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
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/integrations?error=notion_missing_code", site));

  const state = verifyState(stateRaw);
  if (!state) return NextResponse.redirect(new URL("/integrations?error=notion_bad_state", site));

  try {
    const redirectUri = `${site}/api/integrations/notion/callback`;
    const creds = await exchangeNotionCode(code, redirectUri);

    // Discover the database the user shared during the consent flow so two-way
    // sync has a target without an extra setup step.
    const database = await findFirstDatabase(creds.access_token).catch(() => null);

    const db = getDb();
    await saveIntegration(db, state.lcId, "notion", creds as unknown as Record<string, unknown>, {
      workspaceName: creds.workspace_name ?? null,
      databaseId: database?.id ?? null,
      databaseTitle: database?.title ?? null,
      connectedAt: new Date().toISOString()
    });

    await db.insert(schema.auditLog).values({
      lcId: state.lcId,
      userId: state.userId,
      action: "integration.notion.connected",
      entityType: "integration",
      metadata: { provider: "notion", workspace: creds.workspace_name, database: database?.title }
    });

    return NextResponse.redirect(new URL("/integrations?saved=notion", site));
  } catch (err) {
    const message = err instanceof Error ? err.message : "notion_connect_failed";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(message)}`, site));
  }
}
