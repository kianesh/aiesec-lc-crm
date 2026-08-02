import { updateContactSchema, type ContactDetailDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, desc, eq } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, iso, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

const CONTACT_COLUMNS = {
  id: schema.contacts.id,
  fullName: schema.contacts.fullName,
  email: schema.contacts.email,
  phone: schema.contacts.phone,
  type: schema.contacts.type,
  funnelStage: schema.contacts.funnelStage,
  programme: schema.contacts.programme,
  source: schema.contacts.source,
  nationality: schema.contacts.nationality,
  homeCommitteeId: schema.contacts.homeCommitteeId,
  expaPersonId: schema.contacts.expaPersonId,
  customFields: schema.contacts.customFields,
  createdAt: schema.contacts.createdAt,
  updatedAt: schema.contacts.updatedAt
} as const;

export const GET = authed<Params>(async (_request, session, { params }) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [contact] = await db
    .select(CONTACT_COLUMNS)
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, params.id), eq(schema.contacts.lcId, lcId)))
    .limit(1);

  if (!contact) return jsonError("not_found", "That contact no longer exists.");

  const [tagRows, activityRows, conversationRows] = await Promise.all([
    db.select({ tag: schema.contactTags.tag }).from(schema.contactTags).where(eq(schema.contactTags.contactId, contact.id)),
    db
      .select({
        id: schema.contactActivities.id,
        type: schema.contactActivities.type,
        metadata: schema.contactActivities.metadata,
        createdAt: schema.contactActivities.createdAt,
        authorName: schema.users.fullName,
        authorEmail: schema.users.email
      })
      .from(schema.contactActivities)
      .leftJoin(schema.users, eq(schema.users.id, schema.contactActivities.createdBy))
      .where(eq(schema.contactActivities.contactId, contact.id))
      .orderBy(desc(schema.contactActivities.createdAt))
      .limit(30),
    db
      .select({
        id: schema.conversations.id,
        channel: schema.conversations.channel,
        status: schema.conversations.status,
        lastMessageAt: schema.conversations.lastMessageAt
      })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.contactId, contact.id), eq(schema.conversations.lcId, lcId)))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(10)
  ]);

  const body: ContactDetailDto = {
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    type: contact.type,
    funnelStage: contact.funnelStage,
    programme: contact.programme,
    source: contact.source,
    tags: tagRows.map((row) => row.tag),
    nationality: contact.nationality,
    homeCommitteeId: contact.homeCommitteeId,
    expaPersonId: contact.expaPersonId,
    customFields: (contact.customFields ?? {}) as Record<string, unknown>,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
    activities: activityRows.map((row) => ({
      id: row.id,
      type: row.type,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      authorName: row.authorName ?? row.authorEmail ?? null,
      createdAt: row.createdAt.toISOString()
    })),
    conversations: conversationRows.map((row) => ({
      id: row.id,
      channel: row.channel,
      status: row.status,
      lastMessageAt: iso(row.lastMessageAt)
    }))
  };

  return jsonOk(body);
});

export const PATCH = authed<Params>(
  async (request, session, { params }) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = updateContactSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const db = getDb();
    const lcId = session.membership.lcId;
    const scope = and(eq(schema.contacts.id, params.id), eq(schema.contacts.lcId, lcId));

    const [existing] = await db
      .select({ id: schema.contacts.id, funnelStage: schema.contacts.funnelStage })
      .from(schema.contacts)
      .where(scope)
      .limit(1);
    if (!existing) return jsonError("not_found", "That contact no longer exists.");

    // Only touch the columns the client actually sent — `undefined` means
    // "leave alone", `null` means "clear it".
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.fullName !== undefined) updates.fullName = input.fullName;
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.type !== undefined) updates.type = input.type;
    if (input.funnelStage !== undefined) updates.funnelStage = input.funnelStage;
    if (input.programme !== undefined) updates.programme = input.programme;
    if (input.nationality !== undefined) updates.nationality = input.nationality;
    if (input.homeCommitteeId !== undefined) updates.homeCommitteeId = input.homeCommitteeId;

    await db.update(schema.contacts).set(updates).where(scope);

    if (input.tags !== undefined) {
      const tags = Array.from(new Set(input.tags ?? []));
      await db.delete(schema.contactTags).where(eq(schema.contactTags.contactId, params.id));
      if (tags.length > 0) {
        await db
          .insert(schema.contactTags)
          .values(tags.map((tag) => ({ contactId: params.id, tag })))
          .onConflictDoNothing();
      }
    }

    // A stage move is the one edit worth its own timeline entry — it's what the
    // funnel reporting is built on.
    const stageChanged = input.funnelStage !== undefined && input.funnelStage !== existing.funnelStage;
    await db.insert(schema.contactActivities).values({
      contactId: params.id,
      lcId,
      type: stageChanged ? "stage_changed" : "updated",
      metadata: stageChanged
        ? { from: existing.funnelStage, to: input.funnelStage, via: "mobile" }
        : { fields: Object.keys(input), via: "mobile" },
      createdBy: session.userId
    });

    return jsonOk({ ok: true });
  },
  { capability: "manage_contacts" }
);

export const DELETE = authed<Params>(
  async (_request, session, { params }) => {
    const db = getDb();
    const deleted = await db
      .delete(schema.contacts)
      .where(and(eq(schema.contacts.id, params.id), eq(schema.contacts.lcId, session.membership.lcId)))
      .returning({ id: schema.contacts.id });

    if (deleted.length === 0) return jsonError("not_found", "That contact no longer exists.");
    return jsonOk({ ok: true });
  },
  { capability: "manage_contacts" }
);
