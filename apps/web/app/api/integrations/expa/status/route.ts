import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireMembership } from "../../../../../lib/auth";
import { getDb } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const [integration] = await db
    .select({
      status: schema.integrations.status,
      lastSyncedAt: schema.integrations.lastSyncedAt,
      config: schema.integrations.config
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  return NextResponse.json({
    provider: "expa",
    connected: integration?.status === "connected",
    status: integration?.status ?? "disconnected",
    lastSyncedAt: integration?.lastSyncedAt ?? null,
    config: integration?.config ?? {}
  });
}
