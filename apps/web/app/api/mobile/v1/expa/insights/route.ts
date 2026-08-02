import type { ExpaForecastPointDto, ExpaInsightsResponse } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonOk } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { getAnomalies, getChurnRisk, getForecast, getPeerBenchmark, mlConfigured } from "../../../../../../lib/ml-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// The phone's view of the ml-api, aggregated the same way /api/ml/insights does
// it for the web dashboard. ML_API_KEY never leaves the server.
export const GET = authed(
  async (_request, session) => {
    const empty: ExpaInsightsResponse = {
      configured: false,
      officeId: null,
      forecast: null,
      anomalies: null,
      benchmark: null,
      churn: null
    };

    if (!mlConfigured()) return jsonOk(empty);

    const db = getDb();
    const [lc] = await db
      .select({ officeId: schema.localCommittees.expaCommitteeId })
      .from(schema.localCommittees)
      .where(eq(schema.localCommittees.id, session.membership.lcId))
      .limit(1);

    const officeId = lc?.officeId ?? null;
    if (!officeId) return jsonOk({ ...empty, configured: true });

    // Every ml-api helper resolves to null on failure, so a single flaky
    // endpoint degrades one card instead of the whole screen.
    const [forecast, anomalies, benchmark, churn] = await Promise.all([
      getForecast(officeId),
      getAnomalies(officeId),
      getPeerBenchmark(officeId),
      getChurnRisk(officeId)
    ]);

    // History and forecast arrive as separate series; merge them onto one
    // month axis so the chart can draw a single continuous line.
    let forecastView: ExpaInsightsResponse["forecast"] = null;
    if (forecast) {
      const points = new Map<string, ExpaForecastPointDto>();
      for (const point of forecast.history) {
        points.set(point.month, { month: point.month, value: point.value, forecast: null, lower: null, upper: null });
      }
      for (const point of forecast.forecast) {
        const existing = points.get(point.month);
        points.set(point.month, {
          month: point.month,
          value: existing?.value ?? null,
          forecast: point.forecast,
          lower: point.lower,
          upper: point.upper
        });
      }
      forecastView = {
        metric: forecast.metric,
        model: forecast.model,
        points: [...points.values()].sort((a, b) => a.month.localeCompare(b.month))
      };
    }

    const body: ExpaInsightsResponse = {
      configured: true,
      officeId,
      forecast: forecastView,
      anomalies: anomalies
        ? {
            count: anomalies.anomaly_count,
            points: anomalies.points.map((point) => ({
              month: point.month,
              score: point.score,
              isAnomaly: point.is_anomaly,
              drivers: point.drivers.map((driver) => ({ metric: driver.metric, z: driver.z }))
            }))
          }
        : null,
      benchmark: benchmark
        ? {
            period: benchmark.period,
            cohortSize: benchmark.cohort_size,
            metrics: benchmark.metrics.map((metric) => ({
              metric: metric.metric,
              value: metric.value,
              cohortMedian: metric.cohort_median,
              percentile: metric.percentile,
              rank: metric.rank,
              cohortSize: metric.cohort_size
            }))
          }
        : null,
      churn: churn
        ? {
            period: churn.period,
            overallRisk: churn.overall_risk,
            riskScore: churn.risk_score,
            weakestTransition: churn.weakest_transition,
            conversions: churn.conversions.map((conversion) => ({
              transition: conversion.transition,
              rate: conversion.rate,
              cohortMedianRate: conversion.cohort_median_rate,
              dropOff: conversion.drop_off,
              risk: conversion.risk
            }))
          }
        : null
    };

    return jsonOk(body);
  },
  { capability: "view_analytics" }
);
