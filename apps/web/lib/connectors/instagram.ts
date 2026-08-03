import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { getServerEnv } from "../env";
import { encryptSecret } from "../secret-crypto";
import {
  listConversationsViaPage,
  type FacebookIgCreds
} from "./instagram-fb";
import { markIntegrationSynced, readIntegration } from "./store";

// Instagram API with Instagram Login (standalone IG professional accounts).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
type Db = ReturnType<typeof getDb>;

const GRAPH = "https://graph.instagram.com/v21.0";
const OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

// Scopes for the "Instagram API with Instagram Login" flow (graph.instagram.com).
// NOTE: the facebook-login-family scopes (instagram_basic, instagram_manage_insights,
// instagram_content_publish, instagram_manage_comments, instagram_manage_engagement,
// instagram_manage_contents) belong to the *Instagram Graph API via Facebook Login*
// and are NOT valid here — the equivalents below are the correct ones. All of
// these require App Review before they work for accounts you don't own.
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights"
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

  const shortText = await shortRes.text();
  const short = JSON.parse(shortText) as { access_token: string; user_id: number | string; permissions?: string };

  // Instagram sends user_id as a JSON *number*, and it is larger than
  // Number.MAX_SAFE_INTEGER (36997662593215065 parses as ...064). JSON.parse
  // rounds it before String() ever runs, so the id is read straight out of the
  // response text instead. A wrong id here is silent: it matches no
  // participant, so every message looks inbound and the "other" participant in
  // a thread resolves to our own account.
  const rawUserId = /"user_id"\s*:\s*"?(\d+)"?/.exec(shortText)?.[1];

  const longUrl = new URL(`${GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env.INSTAGRAM_APP_SECRET!);
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl);
  if (!longRes.ok) throw new Error(`Instagram long-lived exchange failed: ${await longRes.text()}`);
  const long = (await longRes.json()) as { access_token: string; token_type?: string; expires_in: number };

  return {
    access_token: long.access_token,
    user_id: rawUserId ?? String(short.user_id),
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
// Uses the `me` alias so a stale/app-scoped stored id can't cause a bogus
// "object does not exist" — this isolates failures to the real gate, which is
// Advanced Access to instagram_business_manage_messages (granted via App Review).
export async function listInstagramConversations(token: string, igUserId: string): Promise<IgConversation[]> {
  const url = new URL(`${GRAPH}/me/conversations`);
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

// ---- Insights / analytics (requires instagram_business_manage_insights) ---- //

export type IgMediaInsights = {
  /** Plays for video/reels; null for stills, where the metric doesn't exist. */
  views: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
};

export type IgMediaItem = {
  id: string;
  caption: string | null;
  mediaType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: string | null;
  likeCount: number;
  commentsCount: number;
  /** Null until per-media insights are fetched, or if the call was refused. */
  insights: IgMediaInsights | null;
};

export type IgInsights = {
  username: string | null;
  followers: number | null;
  mediaCount: number | null;
  reach7d: number | null;
  recentMedia: IgMediaItem[];
};

// Account profile counters (followers / media / username).
async function getIgAccountStats(token: string, igUserId: string) {
  const url = new URL(`${GRAPH}/${igUserId}`);
  url.searchParams.set("fields", "username,followers_count,media_count");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Instagram account stats failed: ${await res.text()}`);
  return (await res.json()) as { username?: string; followers_count?: number; media_count?: number };
}

// Reach summed over the last 7 days.
async function getIgReach7d(token: string, igUserId: string): Promise<number | null> {
  const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const url = new URL(`${GRAPH}/${igUserId}/insights`);
  url.searchParams.set("metric", "reach");
  url.searchParams.set("period", "day");
  url.searchParams.set("since", String(since));
  url.searchParams.set("until", String(until));
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null; // insights can 400 on brand-new/low-activity accounts
  const data = (await res.json()) as {
    data?: Array<{ values?: Array<{ value?: number }> }>;
  };
  const values = data.data?.[0]?.values ?? [];
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + (v.value ?? 0), 0);
}

// Recent posts with engagement counts. Exported for the Instagram posts page.
export async function getIgRecentMedia(token: string, igUserId: string, limit = 6): Promise<IgMediaItem[]> {
  const url = new URL(`${GRAPH}/${igUserId}/media`);
  url.searchParams.set("fields", "id,caption,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      caption?: string;
      media_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }>;
  };
  return (data.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    mediaType: m.media_type ?? "IMAGE",
    permalink: m.permalink ?? null,
    thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
    timestamp: m.timestamp ?? null,
    likeCount: m.like_count ?? 0,
    commentsCount: m.comments_count ?? 0,
    insights: null
  }));
}

/**
 * Per-post insights: how a given photo, video or reel actually performed.
 *
 * Metric names are media-type specific and Instagram rejects the whole request
 * with a 400 if any one of them doesn't apply — so the richer set is attempted
 * first and narrowed to `reach` alone before giving up. Insights are also
 * refused outright on accounts that haven't been approved for
 * instagram_business_manage_insights, which is why this degrades to null
 * instead of throwing.
 */
export async function getIgMediaInsights(
  token: string,
  mediaId: string,
  mediaType: string
): Promise<IgMediaInsights | null> {
  const isVideo = mediaType === "VIDEO" || mediaType === "REELS";
  // `plays` is the v21 name for video views; v22 renamed it to `views`.
  const rich = isVideo
    ? ["reach", "saved", "shares", "total_interactions", "plays"]
    : ["reach", "saved", "shares", "total_interactions"];

  async function attempt(metrics: string[]) {
    const url = new URL(`${GRAPH}/${mediaId}/insights`);
    url.searchParams.set("metric", metrics.join(","));
    url.searchParams.set("access_token", token);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
    };
    const byName = new Map<string, number>();
    for (const row of data.data ?? []) {
      const value = row.values?.[0]?.value;
      if (row.name && typeof value === "number") byName.set(row.name, value);
    }
    return byName;
  }

  const values = (await attempt(rich).catch(() => null)) ?? (await attempt(["reach"]).catch(() => null));
  if (!values) return null;

  return {
    views: values.get("plays") ?? values.get("views") ?? null,
    reach: values.get("reach") ?? null,
    saved: values.get("saved") ?? null,
    shares: values.get("shares") ?? null,
    totalInteractions: values.get("total_interactions") ?? null
  };
}

// Pull every Instagram conversation for an LC into the CRM inbox, creating
// conversations + messages and de-duplicating by external ids. Returns the
// number of threads synced.
export type InstagramSyncResult = {
  /** Threads written to the CRM. */
  synced: number;
  /** Threads Instagram returned, before any were skipped. */
  fetched: number;
  /**
   * Threads dropped because no participant other than us could be identified —
   * usually the `participants` field being absent from the response, which is
   * what a token missing instagram_business_manage_messages looks like.
   */
  skippedNoParticipant: number;
};

export async function syncInstagramConversationsToDb(db: Db, lcId: string): Promise<InstagramSyncResult> {
  // Two connection flows write to the same provider row. The facebook one
  // reads DMs through the linked Page, so it takes a different code path
  // entirely — the config marker written at connect time says which.
  const stored = await readIntegration<Record<string, unknown>>(db, lcId, "meta");
  if (!stored) throw new Error("Instagram is not connected for this LC.");

  let threads: IgConversation[];
  let igUserId: string;

  if ((stored.config as { flow?: string } | undefined)?.flow === "facebook") {
    const creds = stored.creds as unknown as FacebookIgCreds;
    igUserId = creds.ig_user_id;
    threads = await listConversationsViaPage(creds.page_access_token, creds.page_id, igUserId);
  } else {
    const { token, igUserId: storedId } = await getInstagramAuth(db, lcId);

    // Ask Instagram who we are rather than trusting the stored id. Connections
    // made before the precision fix hold an id rounded by JSON.parse, and an id
    // that matches no participant fails silently — every message reads inbound
    // and the "other" participant resolves to our own account.
    igUserId = await getInstagramProfile(token)
      .then((profile) => profile.id)
      .catch(() => storedId);

    threads = await listInstagramConversations(token, igUserId);
  }
  let synced = 0;
  let skippedNoParticipant = 0;

  for (const thread of threads) {
    const threadId = thread.participantId;
    if (!threadId) {
      skippedNoParticipant += 1;
      continue;
    }

    const sorted = [...thread.messages].sort(
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
    );
    const lastAt = sorted.length ? new Date(sorted[sorted.length - 1].createdTime) : new Date();

    let [conversation] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.lcId, lcId), eq(schema.conversations.externalThreadId, threadId)))
      .limit(1);

    if (!conversation) {
      [conversation] = await db
        .insert(schema.conversations)
        .values({
          lcId,
          channel: "instagram",
          status: "open",
          externalThreadId: threadId,
          participantExternalId: threadId,
          participantName: thread.participantUsername,
          lastMessageAt: lastAt
        })
        .returning({ id: schema.conversations.id });
    } else {
      await db
        .update(schema.conversations)
        .set({ participantName: thread.participantUsername, lastMessageAt: lastAt })
        .where(eq(schema.conversations.id, conversation.id));
    }

    for (const m of sorted) {
      const [existing] = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(eq(schema.messages.externalMessageId, m.id))
        .limit(1);
      if (existing) continue;
      await db.insert(schema.messages).values({
        conversationId: conversation.id,
        direction: m.from === igUserId ? "out" : "in",
        body: m.text,
        sentAt: new Date(m.createdTime),
        externalMessageId: m.id
      });
    }
    synced++;
  }

  // Record the run even when nothing came back: "synced 2 minutes ago, 0
  // threads" is a far more useful signal than a permanent "Never".
  await markIntegrationSynced(db, lcId, "meta");

  return { synced, fetched: threads.length, skippedNoParticipant };
}

// One resilient call the dashboard widget uses. Each piece degrades to null/[]
// so a partial permission set still renders something useful.
export async function getInstagramInsights(token: string, igUserId: string): Promise<IgInsights> {
  const [stats, reach7d, recentMedia] = await Promise.all([
    getIgAccountStats(token, igUserId).catch(() => ({} as { username?: string; followers_count?: number; media_count?: number })),
    getIgReach7d(token, igUserId).catch(() => null),
    getIgRecentMedia(token, igUserId).catch(() => [])
  ]);

  // One insights call per post, so the widget can show how a reel actually did
  // rather than just its likes. Each degrades to null on its own, keeping a
  // single refused post from blanking the row.
  const withInsights = await Promise.all(
    recentMedia.map(async (media) => ({
      ...media,
      insights: await getIgMediaInsights(token, media.id, media.mediaType).catch(() => null)
    }))
  );

  return {
    username: stats.username ?? null,
    followers: stats.followers_count ?? null,
    mediaCount: stats.media_count ?? null,
    reach7d,
    recentMedia: withInsights
  };
}
