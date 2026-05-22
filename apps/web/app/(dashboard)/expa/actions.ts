"use server";

import { ExpaClient } from "@aiesec/integration-expa";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { decryptSecret } from "../../../lib/secret-crypto";

const syncSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
});

const funnelStatuses = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"] as const;

type FunnelStatus = (typeof funnelStatuses)[number];

export async function syncExpaAnalytics(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/expa?error=not_allowed");

  const input = syncSchema.parse({
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined
  });
  const db = getDb();
  const [integration] = await db
    .select({
      id: schema.integrations.id,
      credentialsEncrypted: schema.integrations.credentialsEncrypted,
      config: schema.integrations.config
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  if (!integration) redirect("/expa?error=missing_expa_connection");

  const config = integration.config as { committeeId?: string };
  if (!config.committeeId) redirect("/expa?error=missing_expa_committee");

  const periodEnd = input.endDate ? new Date(`${input.endDate}T23:59:59.999Z`) : new Date();
  const periodStart = input.startDate
    ? new Date(`${input.startDate}T00:00:00.000Z`)
    : new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 2, periodEnd.getUTCDate()));

  const client = new ExpaClient({ accessToken: decryptSecret(integration.credentialsEncrypted) });
  const basic = await client.analyzeApplications({
    startDate: toDateInput(periodStart),
    endDate: toDateInput(periodEnd),
    basic: { homeOfficeId: config.committeeId, type: "person" }
  });

  const funnelEntries = await Promise.all(
    funnelStatuses.map(async (status) => {
      const result = await client.analyzeApplications({
        startDate: toDateInput(periodStart),
        endDate: toDateInput(periodEnd),
        conversionV2: { officeId: config.committeeId!, status, type: "person" }
      });
      return [status, result] as const;
    })
  );

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

  const payload = {
    basic: serializeResult(basic),
    funnel: Object.fromEntries(funnelEntries.map(([status, result]) => [status, serializeResult(result)])),
    historicalApproved: serializeResult(historical)
  };
  const summary = {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    committeeId: config.committeeId,
    funnel: Object.fromEntries(
      funnelEntries.map(([status, result]) => [status, result.ok ? extractMetric(result.data) : 0])
    ) as Record<FunnelStatus, number>,
    errors: [
      basic.ok ? null : basic.error.message,
      historical.ok ? null : historical.error.message,
      ...funnelEntries.map(([, result]) => (result.ok ? null : result.error.message))
    ].filter(Boolean)
  };

  const [snapshot] = await db
    .insert(schema.expaAnalyticsSnapshots)
    .values({
      lcId: activeMembership.lcId,
      periodStart,
      periodEnd,
      summary,
      rawPayload: payload,
      createdBy: user.id
    })
    .returning({ id: schema.expaAnalyticsSnapshots.id });

  await db
    .update(schema.integrations)
    .set({ lastSyncedAt: new Date(), status: summary.errors.length ? "error" : "connected" })
    .where(eq(schema.integrations.id, integration.id));

  await db
    .insert(schema.expaSyncState)
    .values({
      lcId: activeMembership.lcId,
      lastFullSync: new Date(),
      lastDeltaSync: new Date(),
      cursor: snapshot.id
    })
    .onConflictDoUpdate({
      target: schema.expaSyncState.lcId,
      set: {
        lastFullSync: new Date(),
        lastDeltaSync: new Date(),
        cursor: snapshot.id
      }
    });

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.expa.analytics_synced",
    entityType: "expa_analytics_snapshot",
    entityId: snapshot.id,
    metadata: { provider: "expa", committeeId: config.committeeId, errors: summary.errors.length }
  });

  redirect(summary.errors.length ? "/expa?synced=partial" : "/expa?synced=success");
}

function serializeResult(result: Awaited<ReturnType<ExpaClient["analyzeApplications"]>>) {
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error.message, status: result.error.status };
}

function extractMetric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;

  const object = value as Record<string, unknown>;
  for (const key of ["count", "total", "value", "amount", "applications", "people", "data"]) {
    const nested = extractMetric(object[key]);
    if (nested > 0) return nested;
  }

  return Object.values(object).reduce<number>((sum, item) => sum + extractMetric(item), 0);
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
