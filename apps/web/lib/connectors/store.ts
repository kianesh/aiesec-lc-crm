import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { decryptSecret, encryptSecret } from "../secret-crypto";

type Provider = "google_drive" | "notion" | "meta" | "expa";
type Db = ReturnType<typeof getDb>;

export type StoredIntegration<T = Record<string, unknown>> = {
  id: string;
  creds: T;
  config: Record<string, unknown>;
  status: string;
};

export async function readIntegration<T = Record<string, unknown>>(
  db: Db,
  lcId: string,
  provider: Provider
): Promise<StoredIntegration<T> | null> {
  const [row] = await db
    .select({
      id: schema.integrations.id,
      credentialsEncrypted: schema.integrations.credentialsEncrypted,
      config: schema.integrations.config,
      status: schema.integrations.status
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, provider)))
    .limit(1);
  if (!row) return null;
  let creds: T;
  try {
    creds = JSON.parse(decryptSecret(row.credentialsEncrypted)) as T;
  } catch {
    return null;
  }
  return { id: row.id, creds, config: row.config as Record<string, unknown>, status: row.status };
}

export async function saveIntegration(
  db: Db,
  lcId: string,
  provider: Provider,
  creds: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<void> {
  const credentialsEncrypted = encryptSecret(JSON.stringify(creds));
  const [existing] = await db
    .select({ id: schema.integrations.id })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, provider)))
    .limit(1);

  if (existing) {
    await db
      .update(schema.integrations)
      .set({ credentialsEncrypted, config, status: "connected", lastSyncedAt: new Date() })
      .where(eq(schema.integrations.id, existing.id));
  } else {
    await db.insert(schema.integrations).values({
      lcId,
      provider,
      credentialsEncrypted,
      config,
      status: "connected"
    });
  }
}

/**
 * Stamp a successful sync.
 *
 * `saveIntegration` only touches `lastSyncedAt` on its update path, so a
 * freshly connected integration starts null and stays that way — the sync jobs
 * have to record their own runs or the UI reads "Never" forever.
 */
export async function markIntegrationSynced(db: Db, lcId: string, provider: Provider): Promise<void> {
  await db
    .update(schema.integrations)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, provider)));
}

export async function deleteIntegration(db: Db, lcId: string, provider: Provider): Promise<void> {
  await db
    .delete(schema.integrations)
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, provider)));
}
