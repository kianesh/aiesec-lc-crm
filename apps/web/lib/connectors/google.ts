import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { getServerEnv } from "../env";
import { encryptSecret } from "../secret-crypto";
import { readIntegration } from "./store";

type Db = ReturnType<typeof getDb>;

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/calendar.events"
];

export type GoogleCreds = {
  access_token: string;
  refresh_token?: string;
  expiry_date: number; // epoch ms
  scope?: string;
  token_type?: string;
};

export function googleConfigured() {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleAuthUrl(state: string, redirectUri: string): string {
  const env = getServerEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // always return a refresh_token
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleCreds> {
  const env = getServerEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<GoogleCreds> {
  const env = getServerEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string; token_type?: string };
  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type
  };
}

// Returns a valid access token for the LC, transparently refreshing and
// persisting the new token when the cached one is within 60s of expiry.
export async function getGoogleAccessToken(db: Db, lcId: string): Promise<string> {
  const integration = await readIntegration<GoogleCreds>(db, lcId, "google_drive");
  if (!integration) throw new Error("Google is not connected for this LC.");
  let creds = integration.creds;

  if (creds.expiry_date - Date.now() < 60_000) {
    if (!creds.refresh_token) throw new Error("Google session expired and no refresh token is available. Reconnect Google.");
    creds = await refreshGoogleToken(creds.refresh_token);
    await db
      .update(schema.integrations)
      .set({ credentialsEncrypted: encryptSecret(JSON.stringify(creds)), lastSyncedAt: new Date() })
      .where(eq(schema.integrations.id, integration.id));
  }
  return creds.access_token;
}

// ---- API helpers -------------------------------------------------------- //

export async function getGoogleUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return {};
  return (await res.json()) as { email?: string; name?: string };
}

export async function gmailSend(accessToken: string, to: string, subject: string, bodyText: string, fromName?: string) {
  const headers = [
    `To: ${to}`,
    fromName ? `From: ${fromName}` : "",
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    bodyText
  ]
    .filter(Boolean)
    .join("\r\n");
  const raw = Buffer.from(headers).toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
  return (await res.json()) as { id: string; threadId: string };
}

export async function listGoogleContacts(accessToken: string, pageSize = 100) {
  const url = new URL("https://people.googleapis.com/v1/people/me/connections");
  url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers");
  url.searchParams.set("pageSize", String(pageSize));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google Contacts fetch failed: ${await res.text()}`);
  const data = (await res.json()) as {
    connections?: Array<{
      names?: Array<{ displayName?: string }>;
      emailAddresses?: Array<{ value?: string }>;
      phoneNumbers?: Array<{ value?: string }>;
    }>;
  };
  return (data.connections ?? []).map((c) => ({
    fullName: c.names?.[0]?.displayName ?? "Unknown",
    email: c.emailAddresses?.[0]?.value ?? null,
    phone: c.phoneNumbers?.[0]?.value ?? null
  }));
}

export async function listDriveFiles(accessToken: string, query?: string, pageSize = 25) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime)");
  if (query) url.searchParams.set("q", `name contains '${query.replace(/'/g, "")}'`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
  const data = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string }> };
  return data.files ?? [];
}

export async function createCalendarEvent(
  accessToken: string,
  event: { summary: string; description?: string; startIso: string; endIso: string; attendees?: string[] }
) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startIso },
      end: { dateTime: event.endIso },
      attendees: event.attendees?.map((email) => ({ email }))
    })
  });
  if (!res.ok) throw new Error(`Calendar event create failed: ${await res.text()}`);
  return (await res.json()) as { id: string; htmlLink: string };
}
