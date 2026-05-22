"use server";

import { ExpaClient, requestExpaClientCredentialsToken } from "@aiesec/integration-expa";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getServerEnv } from "../../../lib/env";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "../../../lib/secret-crypto";

const expaSchema = z.object({
  committeeId: z.string().trim().min(1, "EXPA committee ID is required"),
  accessToken: z.string().trim().optional()
});

export async function saveExpaIntegration(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/integrations?error=not_allowed");
  if (!hasEncryptionKey()) redirect("/integrations?error=encryption_key_missing");

  const input = expaSchema.parse({
    committeeId: formData.get("committeeId"),
    accessToken: formData.get("accessToken") || undefined
  });
  const db = getDb();
  const [existing] = await db
    .select({
      id: schema.integrations.id,
      credentialsEncrypted: schema.integrations.credentialsEncrypted
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  if (!existing && !input.accessToken) redirect("/integrations?error=missing_expa_token");

  const credentialsEncrypted = input.accessToken
    ? encryptSecret(input.accessToken)
    : existing?.credentialsEncrypted;

  await db
    .update(schema.localCommittees)
    .set({ expaCommitteeId: input.committeeId })
    .where(eq(schema.localCommittees.id, activeMembership.lcId));

  if (existing) {
    await db
      .update(schema.integrations)
      .set({
        credentialsEncrypted: credentialsEncrypted!,
        config: { committeeId: input.committeeId },
        status: "connected"
      })
      .where(eq(schema.integrations.id, existing.id));
  } else {
    await db.insert(schema.integrations).values({
      lcId: activeMembership.lcId,
      provider: "expa",
      credentialsEncrypted: credentialsEncrypted!,
      config: { committeeId: input.committeeId },
      status: "connected"
    });
  }

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.expa.saved",
    entityType: "integration",
    metadata: { provider: "expa", committeeId: input.committeeId }
  });

  redirect("/integrations?saved=expa");
}

export async function connectExpaWithAppCredentials(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/integrations?error=not_allowed");
  if (!hasEncryptionKey()) redirect("/integrations?error=encryption_key_missing");

  const input = expaSchema.pick({ committeeId: true }).parse({
    committeeId: formData.get("committeeId")
  });
  const env = getServerEnv();
  if (!env.EXPA_CLIENT_ID || !env.EXPA_CLIENT_SECRET) {
    redirect("/integrations?error=missing_expa_app_credentials");
  }

  const token = await requestExpaClientCredentialsToken({
    clientId: env.EXPA_CLIENT_ID,
    clientSecret: env.EXPA_CLIENT_SECRET
  });

  if (!token.ok) {
    redirect(`/integrations?error=${encodeURIComponent(token.error.message)}`);
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: schema.integrations.id })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  await db
    .update(schema.localCommittees)
    .set({ expaCommitteeId: input.committeeId })
    .where(eq(schema.localCommittees.id, activeMembership.lcId));

  const values = {
    credentialsEncrypted: encryptSecret(token.data.access_token),
    config: {
      committeeId: input.committeeId,
      tokenType: token.data.token_type,
      scope: token.data.scope,
      expiresAt: token.data.expires_in ? new Date(Date.now() + token.data.expires_in * 1000).toISOString() : null
    },
    status: "connected" as const
  };

  if (existing) {
    await db.update(schema.integrations).set(values).where(eq(schema.integrations.id, existing.id));
  } else {
    await db.insert(schema.integrations).values({
      lcId: activeMembership.lcId,
      provider: "expa",
      ...values
    });
  }

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.expa.oauth_client_credentials",
    entityType: "integration",
    metadata: { provider: "expa", committeeId: input.committeeId }
  });

  redirect("/integrations?saved=expa");
}

export async function testExpaIntegration() {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/integrations?error=not_allowed");

  const db = getDb();
  const [integration] = await db
    .select({
      id: schema.integrations.id,
      credentialsEncrypted: schema.integrations.credentialsEncrypted,
      config: schema.integrations.config
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  if (!integration) redirect("/integrations?error=missing_expa_connection");

  const config = integration.config as { committeeId?: string };
  if (!config.committeeId) redirect("/integrations?error=missing_expa_committee");

  const client = new ExpaClient({ accessToken: decryptSecret(integration.credentialsEncrypted) });
  const result = await client.getCommittee(config.committeeId);
  const status = result.ok ? "connected" : "error";

  await db
    .update(schema.integrations)
    .set({ status, lastSyncedAt: result.ok ? new Date() : null })
    .where(eq(schema.integrations.id, integration.id));

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.expa.tested",
    entityType: "integration",
    metadata: {
      provider: "expa",
      ok: result.ok,
      error: result.ok ? undefined : result.error.message
    }
  });

  if (!result.ok) redirect(`/integrations?error=${encodeURIComponent(result.error.message)}`);
  redirect("/integrations?tested=expa");
}

export async function disconnectExpaIntegration() {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/integrations?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")));

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.expa.disconnected",
    entityType: "integration",
    metadata: { provider: "expa" }
  });

  redirect("/integrations?disconnected=expa");
}
