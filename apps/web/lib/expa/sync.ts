import { schema } from "@aiesec/db";
import { ExpaClient } from "@aiesec/integration-expa";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { decryptSecret } from "../secret-crypto";

type Db = ReturnType<typeof getDb>;

const FUNNEL_STATUSES = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"] as const;
type FunnelStatus = (typeof FUNNEL_STATUSES)[number];

type PerformanceMetric = {
  doc_count?: number;
  applicants?: { value?: number };
  total_openings?: { value?: number };
};

type PerformanceV3Response = {
  response?: Record<string, PerformanceMetric>;
};

/** The shape stored in `expa_analytics_snapshots.summary`. */
export type ExpaSnapshotSummary = {
  periodStart: string;
  periodEnd: string;
  committeeId: string;
  source: string;
  funnel: Record<FunnelStatus, number>;
  accepted: number;
  opportunities: {
    openOgx: number;
    openIgx: number;
    openOutgoingByProgramme: Record<string, number>;
  };
  errors: string[];
};

export type SyncResult =
  | { ok: true; snapshotId: string; summary: ExpaSnapshotSummary; partial: boolean }
  | { ok: false; error: "missing_expa_connection" | "missing_expa_committee" };

/**
 * Pull a fresh analytics snapshot from EXPA and store it.
 *
 * Shared by the web server action and the mobile API. EXPA's own errors are
 * collected into `summary.errors` rather than thrown: a partial snapshot with
 * three of five metrics is more useful to an LC than no snapshot at all, and
 * the integration row is flipped to `error` so the UI can say so.
 */
export async function syncExpaSnapshot(
  db: Db,
  lcId: string,
  options: { startDate?: string; endDate?: string; actorId?: string | null } = {}
): Promise<SyncResult> {
  const [integration] = await db
    .select({
      id: schema.integrations.id,
      credentialsEncrypted: schema.integrations.credentialsEncrypted,
      config: schema.integrations.config
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  if (!integration) return { ok: false, error: "missing_expa_connection" };

  const config = integration.config as { committeeId?: string };
  if (!config.committeeId) return { ok: false, error: "missing_expa_committee" };

  const periodEnd = options.endDate ? new Date(`${options.endDate}T23:59:59.999Z`) : new Date();
  const periodStart = options.startDate
    ? new Date(`${options.startDate}T00:00:00.000Z`)
    : new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 2, periodEnd.getUTCDate()));

  const client = new ExpaClient({ accessToken: decryptSecret(integration.credentialsEncrypted) });

  const performance = await client.analyzeApplications({
    startDate: toDateInput(periodStart),
    endDate: toDateInput(periodEnd),
    performanceV3: { officeId: config.committeeId }
  });

  const historical = await client.analyzeApplications({
    startDate: toDateInput(periodStart),
    endDate: toDateInput(periodEnd),
    historical: {
      officeId: config.committeeId,
      type: "person",
      interval: "month",
      status: "approved",
      projection: false
    }
  });

  const performanceMetrics = (performance.ok ? (performance.data as PerformanceV3Response) : undefined)?.response ?? {};

  const summary: ExpaSnapshotSummary = {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    committeeId: config.committeeId,
    source: "performance_v3",
    funnel: {
      sign_up: 0,
      applied: applicants(performanceMetrics.applied_total),
      matched: applicants(performanceMetrics.matched_total),
      approved: applicants(performanceMetrics.approved_total),
      realized: applicants(performanceMetrics.realized_total),
      finished: applicants(performanceMetrics.finished_total),
      completed: applicants(performanceMetrics.completed_total)
    },
    accepted: applicants(performanceMetrics.an_accepted_total),
    opportunities: {
      openOgx: performanceMetrics.open_ogx?.doc_count ?? 0,
      openIgx: performanceMetrics.open_icx?.total_openings?.value ?? performanceMetrics.open_icx?.doc_count ?? 0,
      openOutgoingByProgramme: {
        programme1: performanceMetrics.open_o_programme_1?.doc_count ?? 0,
        programme2: performanceMetrics.open_o_programme_2?.doc_count ?? 0,
        programme5: performanceMetrics.open_o_programme_5?.doc_count ?? 0,
        programme7: performanceMetrics.open_o_programme_7?.doc_count ?? 0,
        programme8: performanceMetrics.open_o_programme_8?.doc_count ?? 0,
        programme9: performanceMetrics.open_o_programme_9?.doc_count ?? 0
      }
    },
    errors: [performance.ok ? null : performance.error.message, historical.ok ? null : historical.error.message].filter(
      (message): message is string => Boolean(message)
    )
  };

  const [snapshot] = await db
    .insert(schema.expaAnalyticsSnapshots)
    .values({
      lcId,
      periodStart,
      periodEnd,
      summary,
      rawPayload: {
        performanceV3: serializeResult(performance),
        historicalApproved: serializeResult(historical)
      },
      createdBy: options.actorId ?? null
    })
    .returning({ id: schema.expaAnalyticsSnapshots.id });

  await db
    .update(schema.integrations)
    .set({ lastSyncedAt: new Date(), status: summary.errors.length ? "error" : "connected" })
    .where(eq(schema.integrations.id, integration.id));

  await db
    .insert(schema.expaSyncState)
    .values({ lcId, lastFullSync: new Date(), lastDeltaSync: new Date(), cursor: snapshot?.id ?? null })
    .onConflictDoUpdate({
      target: schema.expaSyncState.lcId,
      set: { lastFullSync: new Date(), lastDeltaSync: new Date(), cursor: snapshot?.id ?? null }
    });

  await db.insert(schema.auditLog).values({
    lcId,
    userId: options.actorId ?? null,
    action: "integration.expa.analytics_synced",
    entityType: "expa_analytics_snapshot",
    entityId: snapshot?.id ?? null,
    metadata: { provider: "expa", committeeId: config.committeeId, errors: summary.errors.length }
  });

  return { ok: true, snapshotId: snapshot?.id ?? "", summary, partial: summary.errors.length > 0 };
}

function serializeResult(result: Awaited<ReturnType<ExpaClient["analyzeApplications"]>>) {
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, error: result.error.message, status: result.error.status };
}

function applicants(metric: PerformanceMetric | undefined): number {
  return metric?.applicants?.value ?? metric?.doc_count ?? 0;
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
