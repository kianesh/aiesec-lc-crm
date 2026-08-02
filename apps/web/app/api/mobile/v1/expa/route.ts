import {
  EXPA_PROGRAMME_LABELS,
  type ExpaFunnelRowDto,
  type ExpaResponse,
  type ExpaSnapshotDto,
  type ExpaTrendPointDto,
  type FunnelStage
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";
import type { ExpaSnapshotSummary } from "../../../../../lib/expa/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

const STAGE_ORDER: FunnelStage[] = [
  "sign_up",
  "applied",
  "matched",
  "approved",
  "realized",
  "finished",
  "completed"
];

// Snapshots are stored as free-form JSON; read them defensively so an older
// snapshot (or a partially-failed sync) renders rather than crashing the screen.
function readSummary(value: unknown): Partial<ExpaSnapshotSummary> {
  return value && typeof value === "object" ? (value as Partial<ExpaSnapshotSummary>) : {};
}

function funnelRows(summary: Partial<ExpaSnapshotSummary>): ExpaFunnelRowDto[] {
  const funnel = (summary.funnel ?? {}) as Record<string, number>;
  let previous: number | null = null;

  return STAGE_ORDER.map((stage) => {
    const value = Number(funnel[stage] ?? 0);
    // Conversion is only meaningful against a non-zero predecessor; EXPA leaves
    // sign_up at 0 for most committees, which would otherwise read as ∞%.
    const conversionFromPrevious = previous !== null && previous > 0 ? value / previous : null;
    if (value > 0 || previous !== null) previous = value;
    return { stage, value, conversionFromPrevious };
  });
}

export const GET = authed(
  async (_request, session) => {
    const db = getDb();
    const lcId = session.membership.lcId;

    const [[integration], [latestRow], trendRows] = await Promise.all([
      db
        .select({
          status: schema.integrations.status,
          config: schema.integrations.config,
          lastSyncedAt: schema.integrations.lastSyncedAt
        })
        .from(schema.integrations)
        .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "expa")))
        .limit(1),
      db
        .select({
          id: schema.expaAnalyticsSnapshots.id,
          periodStart: schema.expaAnalyticsSnapshots.periodStart,
          periodEnd: schema.expaAnalyticsSnapshots.periodEnd,
          createdAt: schema.expaAnalyticsSnapshots.createdAt,
          summary: schema.expaAnalyticsSnapshots.summary
        })
        .from(schema.expaAnalyticsSnapshots)
        .where(eq(schema.expaAnalyticsSnapshots.lcId, lcId))
        .orderBy(desc(schema.expaAnalyticsSnapshots.createdAt))
        .limit(1),
      db
        .select({
          createdAt: schema.expaAnalyticsSnapshots.createdAt,
          summary: schema.expaAnalyticsSnapshots.summary
        })
        .from(schema.expaAnalyticsSnapshots)
        .where(eq(schema.expaAnalyticsSnapshots.lcId, lcId))
        .orderBy(asc(schema.expaAnalyticsSnapshots.createdAt))
        .limit(24)
    ]);

    const config = integration?.config as { committeeId?: string } | undefined;

    let latest: ExpaSnapshotDto | null = null;
    if (latestRow) {
      const summary = readSummary(latestRow.summary);
      const opportunities = summary.opportunities;
      const byProgramme = Object.entries(opportunities?.openOutgoingByProgramme ?? {})
        .map(([key, value]) => ({ key, label: EXPA_PROGRAMME_LABELS[key] ?? key, value: Number(value) || 0 }))
        .filter((row) => row.value > 0);

      latest = {
        id: latestRow.id,
        periodStart: latestRow.periodStart.toISOString(),
        periodEnd: latestRow.periodEnd.toISOString(),
        createdAt: latestRow.createdAt.toISOString(),
        funnel: funnelRows(summary),
        accepted: Number(summary.accepted ?? 0),
        opportunities: {
          openOgx: Number(opportunities?.openOgx ?? 0),
          openIgx: Number(opportunities?.openIgx ?? 0),
          byProgramme
        },
        errors: Array.isArray(summary.errors) ? summary.errors : []
      };
    }

    const trend: ExpaTrendPointDto[] = trendRows.map((row) => {
      const funnel = (readSummary(row.summary).funnel ?? {}) as Record<string, number>;
      return {
        at: row.createdAt.toISOString(),
        applied: Number(funnel.applied ?? 0),
        approved: Number(funnel.approved ?? 0),
        realized: Number(funnel.realized ?? 0)
      };
    });

    const body: ExpaResponse = {
      connected: Boolean(integration),
      status: integration?.status ?? null,
      lastSyncedAt: iso(integration?.lastSyncedAt),
      committeeId: config?.committeeId ?? null,
      // Mirrors the web page's guard: syncing is an integration-level action.
      canSync: session.capabilities.has("manage_integrations"),
      latest,
      trend
    };

    return jsonOk(body);
  },
  { capability: "view_analytics" }
);
