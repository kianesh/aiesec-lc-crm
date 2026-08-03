import {
  INTEGRATION_DESCRIPTIONS,
  INTEGRATION_KEYS,
  INTEGRATION_LABELS,
  type IntegrationAction,
  type IntegrationDto,
  type IntegrationKey,
  type IntegrationsResponse,
  type IntegrationStatus
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";
import { getServerEnv } from "../../../../../lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** Catalog key -> the `integrationProviderEnum` value it is stored under. */
const PROVIDER_FOR: Record<Exclude<IntegrationKey, "resend">, string> = {
  expa: "expa",
  google: "google_drive",
  notion: "notion",
  instagram: "meta"
};

export const GET = authed(async (_request, session) => {
  const db = getDb();
  const env = getServerEnv();
  const canManage = session.capabilities.has("manage_integrations");

  const rows = await db
    .select({
      provider: schema.integrations.provider,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt
    })
    .from(schema.integrations)
    .where(eq(schema.integrations.lcId, session.membership.lcId));

  const byProvider = new Map(rows.map((row) => [row.provider as string, row]));

  const integrations: IntegrationDto[] = INTEGRATION_KEYS.map((key) => {
    // Resend is configured with a server env var rather than a stored row, so
    // it has no credentials to disconnect and nothing to sync.
    if (key === "resend") {
      const status: IntegrationStatus = env.RESEND_API_KEY ? "connected" : "disconnected";
      return {
        key,
        name: INTEGRATION_LABELS[key],
        description: INTEGRATION_DESCRIPTIONS[key],
        status,
        lastSyncedAt: null,
        committeeId: null,
        actions: [],
        connectUrlPath: status === "connected" ? null : "/integrations/resend"
      };
    }

    const row = byProvider.get(PROVIDER_FOR[key]);
    // Only EXPA tracks an error state; the OAuth connectors are present-or-not.
    const status: IntegrationStatus = row
      ? key === "expa"
        ? ((row.status as IntegrationStatus) ?? "disconnected")
        : "connected"
      : "disconnected";
    const connected = status !== "disconnected";

    const actions: IntegrationAction[] = [];
    if (canManage && connected) {
      if (key === "expa") actions.push("expa_sync");
      if (key === "notion") actions.push("notion_push", "notion_pull");
      if (key === "instagram") actions.push("instagram_sync");
      actions.push("disconnect");
    }

    const config = row?.config as { committeeId?: string } | undefined;

    return {
      key,
      name: INTEGRATION_LABELS[key],
      description: INTEGRATION_DESCRIPTIONS[key],
      status,
      lastSyncedAt: iso(row?.lastSyncedAt),
      committeeId: key === "expa" ? config?.committeeId ?? null : null,
      actions,
      // Connecting is an OAuth round trip (or a pasted EXPA token), so the app
      // hands those off to the browser rather than reimplementing them.
      connectUrlPath: connected ? null : `/integrations/${key}`
    };
  });

  const body: IntegrationsResponse = { integrations, canManage };
  return jsonOk(body);
});
