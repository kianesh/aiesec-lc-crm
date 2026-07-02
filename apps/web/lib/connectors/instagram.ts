import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { getServerEnv } from "../env";
import { encryptSecret } from "../secret-crypto";
import { readIntegration } from "./store";

// Instagram API with Instagram Login (standalone IG professional accounts).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
type Db = ReturnType<typeof getDb>;

const GRAPH = "https://graph.instagram.com/v21.0";
const OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

// Scopes for messaging + content publishing (require App Review in production).
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
  "instagram_business_manage_comments"
];

export type InstagramCreds = {
  access_token: string;
  user_id: string; // IG-scoped app user id
  expiry_date: number; // epoch ms
  token_type?: string;
};

export function instagramConfigured() {
  const env = getServerEnv();
  return Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
}

export function getInstagramAuthUrl(state: string, redirectUri: string): string {
  const env = getServerEnv();
  const url = new URL(OAUTH_AUTHORIZE);
  url.searchParams.set("client_id", env.INSTAGRAM_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

// Exchange the auth code for a short-lived token, then immediately upgrade it
// to a long-lived (~60 day) token so we don't lose access after an hour.
export async function exchangeInstagramCode(code: string, redirectUri: string): Promise<InstagramCreds> {
  const env = getServerEnv();
  const shortRes = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID!,
      client_secret: env.INSTAGRAM_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    })
  });
  if (!shortRes.ok) throw new Error(`Instagram token exchange failed: ${await shortRes.text()}`);
  const short = (await shortRes.json()) as { access_token: string; user_id: number | string; permissions?: string };

  const longUrl = new URL(`${GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env.INSTAGRAM_APP_SECRET!);
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl);
  if (!longRes.ok) throw new Error(`Instagram long-lived exchange failed: ${await longRes.text()}`);
  const long = (await longRes.json()) as { access_token: string; token_type?: string; expires_in: number };

  return {
    access_token: long.access_token,
    user_id: String(short.user_id),
    expiry_date: Date.now() + long.expires_in * 1000,
    token_type: long.token_type
  };
}

async function refreshInstagramToken(token: string): Promise<{ access_token: string; expiry_date: number }> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { access_token: data.access_token, expiry_date: Date.now() + data.expires_in * 1000 };
}

// Returns a valid token + IG user id, refreshing the long-lived token when it
// is within 7 days of expiry (Instagram allows refresh after 24h, before 60d).
export async function getInstagramAuth(db: Db, lcId: string): Promise<{ token: string; igUserId: string }> {
  const integration = await readIntegration<InstagramCreds>(db, lcId, "meta");
  if (!integration) throw new Error("Instagram is not connected for this LC.");
  let creds = integration.creds;

  if (creds.expiry_date - Date.now() < 7 * 24 * 60 * 60 * 1000) {
    try {
      const refreshed = await refreshInstagramToken(creds.access_token);
      creds = { ...creds, ...refreshed };
      await db
        .update(schema.integrations)
        .set({ credentialsEncrypted: encryptSecret(JSON.stringify(creds)), lastSyncedAt: new Date() })
        .where(eq(schema.integrations.id, integration.id));
    } catch {
      // If refresh fails (e.g. token already expired), fall through with the
      // existing token; the caller's API request will surface the auth error.
    }
  }
  return { token: creds.access_token, igUserId: creds.user_id };
}

// ---- API helpers -------------------------------------------------------- //

export async function getInstagramProfile(token: string): Promise<{ id: string; username: string }> {
  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram profile fetch failed: ${await res.text()}`);
  const data = (await res.json()) as { user_id?: string; id?: string; username: string };
  return { id: String(data.user_id ?? data.id ?? ""), username: data.username };
}

export type IgConversation = {
  id: string;
  participantId: string | null;
  participantUsername: string | null;
  messages: Array<{ id: string; from: string; to: string; text: string; createdTime: string }>;
};

// Pull DM threads (with recent messages) for the connected IG account.
export async function listInstagramConversations(token: string, igUserId: string): Promise<IgConversation[]> {
  const url = new URL(`${GRAPH}/${igUserId}/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set(
    "fields",
    "participants,messages{id,from,to,message,created_time}"
  );
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram conversations fetch failed: ${await res.text()}`);
  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      participants?: { data?: Array<{ id: string; username?: string }> };
      messages?: { data?: Array<{ id: string; from?: { id: string; username?: string }; to?: { data?: Array<{ id: string }> }; message?: string; created_time: string }> };
    }>;
  };

  return (data.data ?? []).map((c) => {
    // The participant that is not our own IG account is the lead.
    const other = c.participants?.data?.find((p) => p.id !== igUserId) ?? null;
    const messages = (c.messages?.data ?? []).map((m) => ({
      id: m.id,
      from: m.from?.id ?? "",
      to: m.to?.data?.[0]?.id ?? "",
      text: m.message ?? "",
      createdTime: m.created_time
    }));
    return {
      id: c.id,
      participantId: other?.id ?? null,
      participantUsername: other?.username ?? null,
      messages
    };
  });
}

// Send a text DM to a lead (by their IG-scoped id).
export async function sendInstagramMessage(
  token: string,
  igUserId: string,
  recipientId: string,
  text: string
): Promise<{ messageId: string }> {
  const res = await fetch(`${GRAPH}/${igUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
  });
  if (!res.ok) throw new Error(`Instagram send failed: ${await res.text()}`);
  const data = (await res.json()) as { message_id?: string };
  return { messageId: data.message_id ?? "" };
}

// Publish a single image post: create a media container, then publish it.
export async function publishInstagramImage(
  token: string,
  igUserId: string,
  imageUrl: string,
  caption?: string
): Promise<{ mediaId: string }> {
  const createUrl = new URL(`${GRAPH}/${igUserId}/media`);
  createUrl.searchParams.set("image_url", imageUrl);
  if (caption) createUrl.searchParams.set("caption", caption);
  createUrl.searchParams.set("access_token", token);
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) throw new Error(`Instagram media create failed: ${await createRes.text()}`);
  const container = (await createRes.json()) as { id: string };

  const publishUrl = new URL(`${GRAPH}/${igUserId}/media_publish`);
  publishUrl.searchParams.set("creation_id", container.id);
  publishUrl.searchParams.set("access_token", token);
  const publishRes = await fetch(publishUrl, { method: "POST" });
  if (!publishRes.ok) throw new Error(`Instagram publish failed: ${await publishRes.text()}`);
  const published = (await publishRes.json()) as { id: string };
  return { mediaId: published.id };
}
