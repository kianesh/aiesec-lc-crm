import { getServerEnv } from "../env";

// Instagram messaging via *Facebook* Login — the older path, where DMs are read
// through the Facebook Page the Instagram professional account is linked to
// rather than through the Instagram account directly.
//
// This exists alongside connectors/instagram.ts (Instagram Login) because the
// two are genuinely different APIs: different host, different scope family,
// different token, and a different object to ask for conversations. The
// Instagram-Login flow returns an empty conversation list for this LC despite a
// valid, fully-scoped token, so this gives a second route to the same data.
//
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login

const FB_GRAPH = "https://graph.facebook.com/v21.0";
const FB_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

// The facebook-login family. These are NOT the instagram_business_* scopes the
// Instagram-Login flow uses; mixing the two families is rejected outright.
//
// Every entry here must also be added to the app under Permissions and
// features — Facebook rejects the whole authorization with "Invalid Scopes"
// naming the offender, rather than dropping the unknown one and proceeding.
// pages_manage_metadata is deliberately absent for that reason: it is only
// needed to subscribe a Page to webhooks, which this flow does not do, and it
// is not among the permissions this app has.
export const FACEBOOK_IG_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management"
];

export type FacebookIgCreds = {
  /** Long-lived Page access token — what every messaging call is made with. */
  page_access_token: string;
  page_id: string;
  ig_user_id: string;
  /** Long-lived *user* token, kept so the Page list can be re-resolved later. */
  user_access_token: string;
  expiry_date: number;
};

export function facebookLoginConfigured() {
  const env = getServerEnv();
  return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
}

export function getFacebookAuthUrl(state: string, redirectUri: string): string {
  const env = getServerEnv();
  const url = new URL(FB_OAUTH_DIALOG);
  url.searchParams.set("client_id", env.FACEBOOK_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_IG_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 400));
  return JSON.parse(text) as T;
}

/** Auth code -> short-lived user token -> long-lived (~60 day) user token. */
export async function exchangeFacebookCode(code: string, redirectUri: string) {
  const env = getServerEnv();

  const shortUrl = new URL(`${FB_GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID!);
  shortUrl.searchParams.set("client_secret", env.FACEBOOK_APP_SECRET!);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("code", code);
  const short = await json<{ access_token: string }>(shortUrl.toString());

  const longUrl = new URL(`${FB_GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID!);
  longUrl.searchParams.set("client_secret", env.FACEBOOK_APP_SECRET!);
  longUrl.searchParams.set("fb_exchange_token", short.access_token);
  const long = await json<{ access_token: string; expires_in?: number }>(longUrl.toString());

  return {
    userAccessToken: long.access_token,
    // Long-lived user tokens are ~60 days; Meta omits expires_in when the token
    // does not expire, so fall back rather than storing NaN.
    expiryDate: Date.now() + (long.expires_in ?? 60 * 24 * 60 * 60) * 1000
  };
}

export type ResolvedInstagramPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
  igUsername: string | null;
};

/**
 * Find the Page that owns an Instagram professional account.
 *
 * This is the step that fails loudly when the account isn't linked to a Page —
 * the single prerequisite this whole flow rests on — so the error says exactly
 * that rather than surfacing an empty list later.
 */
export async function resolveInstagramPage(userAccessToken: string): Promise<ResolvedInstagramPage> {
  const url = new URL(`${FB_GRAPH}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("access_token", userAccessToken);

  const data = await json<{
    data?: Array<{
      id: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  }>(url.toString());

  const pages = data.data ?? [];
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Pages were returned. Grant the app access to the Page your Instagram account is linked to, then try again."
    );
  }

  const withIg = pages.find((page) => page.instagram_business_account?.id);
  if (!withIg?.instagram_business_account) {
    const names = pages.map((page) => page.name ?? page.id).join(", ");
    throw new Error(
      `None of your Pages (${names}) has an Instagram professional account linked. Link it in Meta Business Suite → Settings → Linked accounts, then reconnect.`
    );
  }
  if (!withIg.access_token) {
    throw new Error("That Page returned no access token. Re-grant Page access and try again.");
  }

  return {
    pageId: withIg.id,
    pageName: withIg.name ?? withIg.id,
    pageAccessToken: withIg.access_token,
    igUserId: withIg.instagram_business_account.id,
    igUsername: withIg.instagram_business_account.username ?? null
  };
}

export type FbIgConversation = {
  id: string;
  participantId: string | null;
  participantUsername: string | null;
  messages: Array<{ id: string; from: string; to: string; text: string; createdTime: string }>;
};

/**
 * DM threads via the Page.
 *
 * `platform=instagram` is required here — unlike on graph.instagram.com, this
 * endpoint serves both Messenger and Instagram threads and defaults to
 * Messenger.
 */
export async function listConversationsViaPage(
  pageAccessToken: string,
  pageId: string,
  igUserId: string
): Promise<FbIgConversation[]> {
  const url = new URL(`${FB_GRAPH}/${pageId}/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("fields", "participants,messages{id,from,to,message,created_time}");
  url.searchParams.set("access_token", pageAccessToken);

  const data = await json<{
    data?: Array<{
      id: string;
      participants?: { data?: Array<{ id: string; username?: string; name?: string }> };
      messages?: {
        data?: Array<{
          id: string;
          from?: { id: string; username?: string };
          to?: { data?: Array<{ id: string }> };
          message?: string;
          created_time: string;
        }>;
      };
    }>;
  }>(url.toString());

  return (data.data ?? []).map((conversation) => {
    // Our own side appears as the IG account id; anyone else is the lead.
    const other = conversation.participants?.data?.find((p) => p.id !== igUserId) ?? null;
    return {
      id: conversation.id,
      participantId: other?.id ?? null,
      participantUsername: other?.username ?? other?.name ?? null,
      messages: (conversation.messages?.data ?? []).map((message) => ({
        id: message.id,
        from: message.from?.id ?? "",
        to: message.to?.data?.[0]?.id ?? "",
        text: message.message ?? "",
        createdTime: message.created_time
      }))
    };
  });
}

/** Send a DM as the Page. */
export async function sendMessageViaPage(
  pageAccessToken: string,
  pageId: string,
  recipientId: string,
  text: string
): Promise<{ messageId: string }> {
  const url = new URL(`${FB_GRAPH}/${pageId}/messages`);
  url.searchParams.set("access_token", pageAccessToken);
  const body = await json<{ message_id?: string }>(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
  });
  return { messageId: body.message_id ?? "" };
}
