"use server";

import { ExpaClient } from "@aiesec/integration-expa";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { decryptSecret } from "../../../lib/secret-crypto";

const contactSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  type: z.enum(["candidate", "company", "lc_partner", "other"]).default("candidate"),
  funnelStage: z.enum(["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"]).optional(),
  programme: z.enum(["gt", "ge", "gv", "other"]).optional(),
  nationality: z.string().optional()
});

export async function createContact(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  const input = contactSchema.parse({
    fullName: formData.get("fullName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    type: formData.get("type") || "candidate",
    funnelStage: formData.get("funnelStage") || undefined,
    programme: formData.get("programme") || undefined,
    nationality: formData.get("nationality") || undefined
  });

  const db = getDb();
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      lcId: activeMembership.lcId,
      fullName: input.fullName,
      email: input.email || null,
      phone: input.phone || null,
      type: input.type,
      funnelStage: input.funnelStage || null,
      programme: input.programme || null,
      nationality: input.nationality || null,
      source: "manual"
    })
    .returning({ id: schema.contacts.id });

  await db.insert(schema.contactActivities).values({
    contactId: contact.id,
    lcId: activeMembership.lcId,
    type: "created",
    metadata: { source: "manual" },
    createdBy: user.id
  });

  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  const input = contactSchema.parse({
    fullName: formData.get("fullName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    type: formData.get("type") || "candidate",
    funnelStage: formData.get("funnelStage") || undefined,
    programme: formData.get("programme") || undefined,
    nationality: formData.get("nationality") || undefined
  });

  const db = getDb();
  await db
    .update(schema.contacts)
    .set({
      fullName: input.fullName,
      email: input.email || null,
      phone: input.phone || null,
      type: input.type,
      funnelStage: input.funnelStage || null,
      programme: input.programme || null,
      nationality: input.nationality || null,
      updatedAt: new Date()
    })
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.lcId, activeMembership.lcId)));

  await db.insert(schema.contactActivities).values({
    contactId: id,
    lcId: activeMembership.lcId,
    type: "updated",
    metadata: {},
    createdBy: user.id
  });

  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/contacts?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.contacts)
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.lcId, activeMembership.lcId)));

  redirect("/contacts");
}

export async function addNote(contactId: string, formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  const note = String(formData.get("note") || "").trim();
  if (!note) redirect(`/contacts/${contactId}`);

  const db = getDb();
  await db.insert(schema.contactActivities).values({
    contactId,
    lcId: activeMembership.lcId,
    type: "note_added",
    metadata: { note },
    createdBy: user.id
  });

  redirect(`/contacts/${contactId}`);
}

export async function syncExpaContacts() {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/contacts?error=not_allowed");

  const db = getDb();
  const [integration] = await db
    .select({
      credentialsEncrypted: schema.integrations.credentialsEncrypted,
      config: schema.integrations.config
    })
    .from(schema.integrations)
    .where(
      and(
        eq(schema.integrations.lcId, activeMembership.lcId),
        eq(schema.integrations.provider, "expa")
      )
    )
    .limit(1);

  if (!integration) redirect("/contacts?error=missing_expa_connection");

  const config = integration.config as { committeeId?: string };
  if (!config.committeeId) redirect("/contacts?error=missing_expa_committee");

  try {
    const client = new ExpaClient({ accessToken: decryptSecret(integration.credentialsEncrypted) });
    let page = 1;
    let synced = 0;

    while (true) {
      const result = await client.listPeople({
        page,
        perPage: 50,
        filters: { home_committee: { id: config.committeeId } }
      });

      if (!result.ok) break;

      const people = (result.data as { data?: unknown[] }).data ?? [];
      if (!people.length) break;

      for (const person of people as Record<string, unknown>[]) {
        const expaId = String(person.id ?? "");
        if (!expaId) continue;

        const fullName = String(person.full_name ?? person.name ?? "Unknown");
        const email = String((person as { email?: string }).email ?? "");
        const programme = resolveProgramme(person);
        const funnelStage = resolveStage(person);

        const [existing] = await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.lcId, activeMembership.lcId),
              eq(schema.contacts.expaPersonId, expaId)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(schema.contacts)
            .set({ fullName, email: email || null, funnelStage, programme, updatedAt: new Date() })
            .where(eq(schema.contacts.id, existing.id));
          await db.insert(schema.contactActivities).values({
            contactId: existing.id,
            lcId: activeMembership.lcId,
            type: "expa_synced",
            metadata: { expaId },
            createdBy: user.id
          });
        } else {
          const [created] = await db
            .insert(schema.contacts)
            .values({
              lcId: activeMembership.lcId,
              fullName,
              email: email || null,
              type: "candidate",
              funnelStage,
              programme,
              source: "expa",
              expaPersonId: expaId
            })
            .returning({ id: schema.contacts.id });
          await db.insert(schema.contactActivities).values({
            contactId: created.id,
            lcId: activeMembership.lcId,
            type: "expa_synced",
            metadata: { expaId },
            createdBy: user.id
          });
        }
        synced++;
      }

      const paging = (result.data as { paging?: { total_pages?: number; current_page?: number } }).paging;
      if (!paging || page >= (paging.total_pages ?? 1)) break;
      page++;
    }

    await db
      .update(schema.expaSyncState)
      .set({ lastDeltaSync: new Date() })
      .where(eq(schema.expaSyncState.lcId, activeMembership.lcId));

    redirect(`/contacts?synced=${synced}`);
  } catch {
    redirect("/contacts?error=sync_failed");
  }
}

export async function createSmartList(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/contacts?error=not_allowed");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/contacts");

  let filters = {};
  try {
    const raw = formData.get("filters");
    if (raw) filters = JSON.parse(String(raw));
  } catch {}

  const db = getDb();
  await db.insert(schema.smartLists).values({
    lcId: activeMembership.lcId,
    name,
    description: String(formData.get("description") || "") || null,
    filters,
    createdBy: user.id
  });

  redirect("/contacts");
}

export async function deleteSmartList(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/contacts?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.smartLists)
    .where(and(eq(schema.smartLists.id, id), eq(schema.smartLists.lcId, activeMembership.lcId)));

  redirect("/contacts");
}

function resolveProgramme(person: Record<string, unknown>) {
  const programmes = person.programmes as { id?: number }[] | undefined;
  if (!programmes?.length) return null;
  const id = programmes[0]?.id;
  if (id === 1) return "gt" as const;
  if (id === 2) return "ge" as const;
  if (id === 5) return "gv" as const;
  return "other" as const;
}

function resolveStage(person: Record<string, unknown>) {
  const status = String(person.status ?? "").toLowerCase();
  const valid = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"];
  return valid.includes(status) ? (status as "sign_up" | "applied" | "matched" | "approved" | "realized" | "finished" | "completed") : null;
}
