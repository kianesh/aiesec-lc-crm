import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { getServerEnv } from "../env";
import { readIntegration } from "./store";

type Db = ReturnType<typeof getDb>;
const NOTION_VERSION = "2022-06-28";

export type NotionCreds = { access_token: string; workspace_name?: string; workspace_id?: string; bot_id?: string };

export function notionConfigured() {
  const env = getServerEnv();
  return Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
}

export function getNotionAuthUrl(state: string, redirectUri: string): string {
  const env = getServerEnv();
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", env.NOTION_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeNotionCode(code: string, redirectUri: string): Promise<NotionCreds> {
  const env = getServerEnv();
  const basic = Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri })
  });
  if (!res.ok) throw new Error(`Notion token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as NotionCreds;
  return { access_token: data.access_token, workspace_name: data.workspace_name, workspace_id: data.workspace_id, bot_id: data.bot_id };
}

async function notionFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`Notion API ${path} failed: ${await res.text()}`);
  return (await res.json()) as T;
}

// Find a database the integration can access (the user shares one during OAuth).
export async function findFirstDatabase(token: string): Promise<{ id: string; title: string } | null> {
  const data = await notionFetch<{ results: Array<{ id: string; title?: Array<{ plain_text: string }> }> }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 10 })
  });
  const db = data.results[0];
  if (!db) return null;
  return { id: db.id, title: db.title?.map((t) => t.plain_text).join("") || "Untitled" };
}

type NotionDbSchema = { properties: Record<string, { id: string; type: string }> };

async function getDbSchema(token: string, databaseId: string): Promise<NotionDbSchema> {
  return notionFetch<NotionDbSchema>(token, `/databases/${databaseId}`);
}

// Case-insensitively resolve a property name present in the database.
function resolveProp(schemaProps: NotionDbSchema["properties"], candidates: string[]): { name: string; type: string } | null {
  for (const cand of candidates) {
    const match = Object.entries(schemaProps).find(([name]) => name.toLowerCase() === cand.toLowerCase());
    if (match) return { name: match[0], type: match[1].type };
  }
  return null;
}

function buildProps(
  props: NotionDbSchema["properties"],
  contact: { fullName: string; email: string | null; phone: string | null; type: string; funnelStage: string | null; programme: string | null }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const title = resolveProp(props, ["Name", "Full Name", "Title"]);
  if (title) out[title.name] = { title: [{ text: { content: contact.fullName } }] };
  const email = resolveProp(props, ["Email"]);
  if (email && email.type === "email") out[email.name] = { email: contact.email };
  const phone = resolveProp(props, ["Phone", "Phone Number"]);
  if (phone && phone.type === "phone_number") out[phone.name] = { phone_number: contact.phone };
  const type = resolveProp(props, ["Type", "Contact Type"]);
  if (type && type.type === "select" && contact.type) out[type.name] = { select: { name: contact.type } };
  const stage = resolveProp(props, ["Stage", "Funnel Stage", "Status"]);
  if (stage && stage.type === "select" && contact.funnelStage) out[stage.name] = { select: { name: contact.funnelStage } };
  const programme = resolveProp(props, ["Programme", "Program"]);
  if (programme && programme.type === "select" && contact.programme) out[programme.name] = { select: { name: contact.programme } };
  return out;
}

// Push the LC's contacts into the connected Notion database (create or update).
export async function pushContactsToNotion(db: Db, lcId: string): Promise<{ pushed: number }> {
  const integration = await readIntegration<NotionCreds>(db, lcId, "notion");
  if (!integration) throw new Error("Notion is not connected.");
  const databaseId = integration.config.databaseId as string | undefined;
  if (!databaseId) throw new Error("No Notion database selected. Reconnect and share a database.");
  const token = integration.creds.access_token;
  const dbSchema = await getDbSchema(token, databaseId);

  const contacts = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.lcId, lcId));

  let pushed = 0;
  for (const c of contacts) {
    const properties = buildProps(dbSchema.properties, c);
    if (c.notionPageId) {
      await notionFetch(token, `/pages/${c.notionPageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
    } else {
      const page = await notionFetch<{ id: string }>(token, "/pages", {
        method: "POST",
        body: JSON.stringify({ parent: { database_id: databaseId }, properties })
      });
      await db.update(schema.contacts).set({ notionPageId: page.id }).where(eq(schema.contacts.id, c.id));
    }
    pushed++;
  }
  await db.update(schema.integrations).set({ lastSyncedAt: new Date() }).where(eq(schema.integrations.id, integration.id));
  return { pushed };
}

// Pull pages from the Notion database into contacts (upsert by notionPageId / email).
export async function importContactsFromNotion(db: Db, lcId: string): Promise<{ imported: number }> {
  const integration = await readIntegration<NotionCreds>(db, lcId, "notion");
  if (!integration) throw new Error("Notion is not connected.");
  const databaseId = integration.config.databaseId as string | undefined;
  if (!databaseId) throw new Error("No Notion database selected.");
  const token = integration.creds.access_token;

  const data = await notionFetch<{ results: Array<{ id: string; properties: Record<string, unknown> }> }>(
    token,
    `/databases/${databaseId}/query`,
    { method: "POST", body: JSON.stringify({ page_size: 100 }) }
  );

  let imported = 0;
  for (const page of data.results) {
    const parsed = parsePage(page.properties);
    if (!parsed.fullName) continue;

    const [existing] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.lcId, lcId), eq(schema.contacts.notionPageId, page.id)))
      .limit(1);

    if (existing) {
      await db
        .update(schema.contacts)
        .set({ fullName: parsed.fullName, email: parsed.email, phone: parsed.phone, updatedAt: new Date() })
        .where(eq(schema.contacts.id, existing.id));
    } else {
      await db.insert(schema.contacts).values({
        lcId,
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        source: "notion",
        notionPageId: page.id
      });
    }
    imported++;
  }
  await db.update(schema.integrations).set({ lastSyncedAt: new Date() }).where(eq(schema.integrations.id, integration.id));
  return { imported };
}

function parsePage(props: Record<string, unknown>): { fullName: string | null; email: string | null; phone: string | null } {
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  for (const value of Object.values(props)) {
    const p = value as { type: string; title?: Array<{ plain_text: string }>; email?: string; phone_number?: string };
    if (p.type === "title" && p.title) fullName = p.title.map((t) => t.plain_text).join("") || null;
    else if (p.type === "email") email = p.email ?? null;
    else if (p.type === "phone_number") phone = p.phone_number ?? null;
  }
  return { fullName, email, phone };
}
