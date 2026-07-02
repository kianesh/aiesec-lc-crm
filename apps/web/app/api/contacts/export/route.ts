import { schema } from "@aiesec/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAssistantSession } from "../../../../lib/assistant/auth";
import { getDb } from "../../../../lib/db";
import { toCsv } from "../../../../lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "full_name",
  "email",
  "phone",
  "type",
  "funnel_stage",
  "programme",
  "nationality",
  "source",
  "created_at"
];

export async function GET() {
  const session = await getAssistantSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const contacts = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.lcId, session.membership.lcId))
    .orderBy(desc(schema.contacts.createdAt));

  const rows = contacts.map((c) => [
    c.fullName,
    c.email,
    c.phone,
    c.type,
    c.funnelStage,
    c.programme,
    c.nationality,
    c.source,
    c.createdAt.toISOString()
  ]);

  const csv = toCsv(HEADERS, rows);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${date}.csv"`
    }
  });
}
