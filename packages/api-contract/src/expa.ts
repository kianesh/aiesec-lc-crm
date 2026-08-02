import { z } from "zod";
import type { FunnelStage } from "./enums";

// ------------------------------------------------------------------ DTOs --

export type ExpaFunnelRowDto = {
  stage: FunnelStage;
  value: number;
  /** Conversion from the previous non-zero stage, 0–1. Null for the first row. */
  conversionFromPrevious: number | null;
};

export type ExpaOpportunitiesDto = {
  openOgx: number;
  openIgx: number;
  byProgramme: { key: string; label: string; value: number }[];
};

export type ExpaSnapshotDto = {
  id: string;
  /** ISO 8601 */
  periodStart: string;
  /** ISO 8601 */
  periodEnd: string;
  /** ISO 8601 */
  createdAt: string;
  funnel: ExpaFunnelRowDto[];
  accepted: number;
  opportunities: ExpaOpportunitiesDto;
  /** Non-fatal EXPA API errors recorded when the snapshot was taken. */
  errors: string[];
};

/** One point per snapshot, oldest first — the "approved over time" trend. */
export type ExpaTrendPointDto = {
  /** ISO 8601 */
  at: string;
  applied: number;
  approved: number;
  realized: number;
};

export type ExpaResponse = {
  connected: boolean;
  status: "connected" | "disconnected" | "error" | null;
  /** ISO 8601 */
  lastSyncedAt: string | null;
  committeeId: string | null;
  /** Whether this member may trigger a sync from the phone. */
  canSync: boolean;
  latest: ExpaSnapshotDto | null;
  trend: ExpaTrendPointDto[];
};

// --------------------------------------------------------------- ML views --

export type ExpaForecastPointDto = {
  month: string;
  value: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
};

export type ExpaBenchmarkRowDto = {
  metric: string;
  value: number;
  cohortMedian: number;
  /** 0–100 */
  percentile: number;
  rank: number;
  cohortSize: number;
};

export type ExpaConversionRowDto = {
  transition: string;
  rate: number;
  cohortMedianRate: number;
  dropOff: number;
  risk: string;
};

export type ExpaInsightsResponse = {
  /** False when ML_API_URL / ML_API_KEY aren't set on the server. */
  configured: boolean;
  /** Null when the LC has no EXPA committee id yet. */
  officeId: string | null;
  forecast: {
    metric: string;
    model: string;
    points: ExpaForecastPointDto[];
  } | null;
  anomalies: {
    count: number;
    points: { month: string; score: number; isAnomaly: boolean; drivers: { metric: string; z: number }[] }[];
  } | null;
  benchmark: { period: string; cohortSize: number; metrics: ExpaBenchmarkRowDto[] } | null;
  churn: {
    period: string;
    overallRisk: string;
    riskScore: number;
    weakestTransition: string | null;
    conversions: ExpaConversionRowDto[];
  } | null;
};

// -------------------------------------------------------------- requests --

export const expaSyncSchema = z.object({
  /** YYYY-MM-DD. Defaults to a 90-day window ending today. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export type ExpaSyncInput = z.input<typeof expaSyncSchema>;

export type ExpaSyncResponse = {
  ok: boolean;
  /** True when the snapshot saved but EXPA returned errors for some metrics. */
  partial: boolean;
  errors: string[];
};

/** EXPA programme ids as they appear in the performance payload. */
export const EXPA_PROGRAMME_LABELS: Record<string, string> = {
  programme1: "Global Talent",
  programme2: "Global Entrepreneur",
  programme5: "Global Volunteer",
  programme7: "Programme 7",
  programme8: "Programme 8",
  programme9: "Programme 9"
};
