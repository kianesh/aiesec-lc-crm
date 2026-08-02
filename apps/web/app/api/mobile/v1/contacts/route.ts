import {
  contactListQuerySchema,
  createContactSchema,
  type ContactListItemDto,
  type ContactListResponse
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Db = ReturnType<typeof getDb>;

// Tags live in a join table; fetch them in one round trip for the page of
// contacts we're returning rather than N+1-ing per row.
async function tagsByContact(db: Db, contactIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (contactIds.length === 0) return map;
  const rows = await db
    .select({ contactId: schema.contactTags.contactId, tag: schema.contactTags.tag })
    .from(schema.contactTags)
    .where(inArray(schema.contactTags.contactId, contactIds));
  for (const row of rows) {
    const existing = map.get(row.contactId);
    if (existing) existing.push(row.tag);
    else map.set(row.contactId, [row.tag]);
  }
  return map;
}

export const GET = authed(async (request, session) => {
  const url = new URL(request.url);
  const parsed = contactListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodError(parsed.error);
  const { q, type, stage, programme, tag, limit, offset } = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;

  // Unlike the web page (which loads every contact and filters in memory),
  // mobile filters in Postgres — a phone on cellular shouldn't download the
  // whole book to show 20 rows.
  const filters: SQL[] = [eq(schema.contacts.lcId, lcId)];
  if (type) filters.push(eq(schema.contacts.type, type));
  if (stage) filters.push(eq(schema.contacts.funnelStage, stage));
  if (programme) filters.push(eq(schema.contacts.programme, programme));
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    const search = or(
      ilike(schema.contacts.fullName, pattern),
      ilike(schema.contacts.email, pattern),
      ilike(schema.contacts.phone, pattern)
    );
    if (search) filters.push(search);
  }
  if (tag) {
    const tagged = db
      .select({ contactId: schema.contactTags.contactId })
      .from(schema.contactTags)
      .where(eq(schema.contactTags.tag, tag));
    filters.push(inArray(schema.contacts.id, tagged));
  }

  const where = and(...filters);

  const [rows, [totalRow], tagRows] = await Promise.all([
    db
      .select({
        id: schema.contacts.id,
        fullName: schema.contacts.fullName,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        type: schema.contacts.type,
        funnelStage: schema.contacts.funnelStage,
        programme: schema.contacts.programme,
        source: schema.contacts.source,
        createdAt: schema.contacts.createdAt,
        updatedAt: schema.contacts.updatedAt
      })
      .from(schema.contacts)
      .where(where)
      .orderBy(desc(schema.contacts.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.contacts).where(where),
    db
      .selectDistinct({ tag: schema.contactTags.tag })
      .from(schema.contactTags)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.contactTags.contactId))
      .where(eq(schema.contacts.lcId, lcId))
      .orderBy(schema.contactTags.tag)
  ]);

  const tagMap = await tagsByContact(
    db,
    rows.map((row) => row.id)
  );

  const contacts: ContactListItemDto[] = rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    type: row.type,
    funnelStage: row.funnelStage,
    programme: row.programme,
    source: row.source,
    tags: tagMap.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }));

  const body: ContactListResponse = {
    contacts,
    total: totalRow?.value ?? 0,
    limit,
    offset,
    availableTags: tagRows.map((row) => row.tag)
  };

  return jsonOk(body);
});

export const POST = authed(
  async (request, session) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = createContactSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const db = getDb();
    const lcId = session.membership.lcId;

    const [created] = await db
      .insert(schema.contacts)
      .values({
        lcId,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        type: input.type,
        funnelStage: input.funnelStage ?? null,
        programme: input.programme ?? null,
        nationality: input.nationality ?? null,
        homeCommitteeId: input.homeCommitteeId ?? null,
        source: "manual"
      })
      .returning({
        id: schema.contacts.id,
        fullName: schema.contacts.fullName,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        type: schema.contacts.type,
        funnelStage: schema.contacts.funnelStage,
        programme: schema.contacts.programme,
        source: schema.contacts.source,
        createdAt: schema.contacts.createdAt,
        updatedAt: schema.contacts.updatedAt
      });

    if (!created) return jsonError("server_error", "Could not create the contact.");

    const tags = Array.from(new Set(input.tags ?? []));
    if (tags.length > 0) {
      await db
        .insert(schema.contactTags)
        .values(tags.map((tag) => ({ contactId: created.id, tag })))
        .onConflictDoNothing();
    }

    await db.insert(schema.contactActivities).values({
      contactId: created.id,
      lcId,
      type: "created",
      metadata: { via: "mobile" },
      createdBy: session.userId
    });

    const body: ContactListItemDto = {
      id: created.id,
      fullName: created.fullName,
      email: created.email,
      phone: created.phone,
      type: created.type,
      funnelStage: created.funnelStage,
      programme: created.programme,
      source: created.source,
      tags,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    };

    return jsonOk(body, { status: 201 });
  },
  { capability: "manage_contacts" }
);
