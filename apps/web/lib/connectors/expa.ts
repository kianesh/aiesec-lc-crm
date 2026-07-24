import { requestExpaClientCredentialsToken } from "@aiesec/integration-expa";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { getServerEnv } from "../env";
import { encryptSecret, hasEncryptionKey } from "../secret-crypto";

type Db = ReturnType<typeof getDb>;

export type ExpaConnectResult =
  | { ok: true }
  | { ok: false; reason: "missing_app_credentials" | "missing_committee" | "encryption_key_missing" | "token_failed"; message?: string };

/**
 * Auto-generate an EXPA access token via the app's client credentials and store
 * it as the LC's `expa` integration. Called when an admin sets the committee ID
 * (in onboarding or org settings) so connecting EXPA is a one-click affair.
 *
 * The token is stored in the same shape the EXPA sync reads (raw access token
 * in `credentialsEncrypted`, metadata in `config`).
 */
export async function connectExpaWithClientCredentials(
  db: Db,
  lcId: string,
  committeeId: string | null | undefined
): Promise<ExpaConnectResult> {
  const env = getServerEnv();
  if (!env.EXPA_CLIENT_ID || !env.EXPA_CLIENT_SECRET) return { ok: false, reason: "missing_app_credentials" };
  if (!hasEncryptionKey()) return { ok: false, reason: "encryption_key_missing" };
  const committee = (committeeId ?? "").trim();
  if (!committee) return { ok: false, reason: "missing_committee" };

  const token = await requestExpaClientCredentialsToken({
    clientId: env.EXPA_CLIENT_ID,
    clientSecret: env.EXPA_CLIENT_SECRET
  });
  if (!token.ok) return { ok: false, reason: "token_failed", message: token.error.message };

  const values = {
    credentialsEncrypted: encryptSecret(token.data.access_token),
    config: {
      committeeId: committee,
      tokenType: token.data.token_type ?? "bearer",
      scope: token.data.scope,
      expiresAt: token.data.expires_in ? new Date(Date.now() + token.data.expires_in * 1000).toISOString() : null
    },
    status: "connected" as const
  };

  const [existing] = await db
    .select({ id: schema.integrations.id })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  if (existing) {
    await db.update(schema.integrations).set(values).where(eq(schema.integrations.id, existing.id));
  } else {
    await db.insert(schema.integrations).values({ lcId, provider: "expa", ...values });
  }
  return { ok: true };
}
