import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAssistantSession } from "../../../../lib/assistant/auth";
import { getDb } from "../../../../lib/db";
import { getAnomalies, getChurnRisk, getForecast, getPeerBenchmark, mlConfigured } from "../../../../lib/ml-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregates the ml-api endpoints for the current LC. Keeps ML_API_KEY on the
// server; the dashboard widget calls this route, not the ml-api directly.
export async function GET() {
  const session = await getAssistantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!mlConfigured()) return NextResponse.json({ configured: false });

  const db = getDb();
  const [lc] = await db
    .select({ officeId: schema.localCommittees.expaCommitteeId })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, session.membership.lcId))
    .limit(1);

  const officeId = lc?.officeId ?? null;
  if (!officeId) return NextResponse.json({ configured: true, officeId: null });

  const [forecast, anomalies, benchmark, churn] = await Promise.all([
    getForecast(officeId),
    getAnomalies(officeId),
    getPeerBenchmark(officeId),
    getChurnRisk(officeId)
  ]);

  return NextResponse.json({ configured: true, officeId, forecast, anomalies, benchmark, churn });
}
