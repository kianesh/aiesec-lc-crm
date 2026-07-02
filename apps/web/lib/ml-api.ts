import { getServerEnv } from "./env";

// Typed views of the ml-api responses (see services/ml-api/app/schemas).
export type ForecastResponse = {
  lc_code: string;
  metric: string;
  model: string;
  horizon_months: number;
  history: { month: string; value: number }[];
  forecast: { month: string; forecast: number; lower: number; upper: number }[];
  generated_at: string;
};

export type AnomalyResponse = {
  lc_code: string;
  method: string;
  n_months: number;
  anomaly_count: number;
  points: { month: string; score: number; is_anomaly: boolean; drivers: { metric: string; value: number; z: number }[] }[];
  generated_at: string;
};

export type PeerBenchmarkResponse = {
  lc_code: string;
  period: string;
  cohort_size: number;
  metrics: { metric: string; value: number; cohort_median: number; percentile: number; rank: number; cohort_size: number }[];
  generated_at: string;
};

export type ChurnRiskResponse = {
  lc_code: string;
  period: string;
  overall_risk: string;
  risk_score: number;
  weakest_transition: string | null;
  conversions: { transition: string; rate: number; cohort_median_rate: number; drop_off: number; risk: string }[];
  generated_at: string;
};

export function mlConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.ML_API_URL && env.ML_API_KEY);
}

// Fetch a single ml-api endpoint. Returns null on any failure (unconfigured,
// network, timeout, non-2xx) so callers can degrade gracefully.
async function mlFetch<T>(path: string): Promise<T | null> {
  const env = getServerEnv();
  if (!env.ML_API_URL || !env.ML_API_KEY) return null;
  try {
    const res = await fetch(`${env.ML_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${env.ML_API_KEY}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getForecast(officeId: string, metric = "funnel.applied", horizon = 6) {
  return mlFetch<ForecastResponse>(
    `/forecast-demand/${encodeURIComponent(officeId)}?metric=${encodeURIComponent(metric)}&horizon=${horizon}`
  );
}

export function getAnomalies(officeId: string) {
  return mlFetch<AnomalyResponse>(`/anomalies/${encodeURIComponent(officeId)}`);
}

export function getPeerBenchmark(officeId: string) {
  return mlFetch<PeerBenchmarkResponse>(`/peer-benchmark/${encodeURIComponent(officeId)}`);
}

export function getChurnRisk(officeId: string) {
  return mlFetch<ChurnRiskResponse>(`/churn-risk/${encodeURIComponent(officeId)}`);
}
