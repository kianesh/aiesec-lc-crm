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
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly", // free/busy lookups for availability
  "https://www.googleapis.com/auth/forms.body.readonly", // read a form's questions
  "https://www.googleapis.com/auth/forms.responses.readonly" // read interest-form submissions
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
  event: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
    attendees?: string[];
    calendarId?: string;
    addMeet?: boolean; // auto-generate a Google Meet conference link
    sendUpdates?: "all" | "externalOnly" | "none"; // let Calendar email the invite
  }
) {
  const calendarId = encodeURIComponent(event.calendarId ?? "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  if (event.addMeet) url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", event.sendUpdates ?? "all");

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startIso, timeZone: event.timeZone },
    end: { dateTime: event.endIso, timeZone: event.timeZone },
    attendees: event.attendees?.map((email) => ({ email }))
  };
  if (event.addMeet) {
    // A unique requestId per event makes Google mint a fresh Meet link.
    body.conferenceData = {
      createRequest: {
        requestId: `aiesec-${event.startIso}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Calendar event create failed: ${await res.text()}`);
  const data = (await res.json()) as {
    id: string;
    htmlLink: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  const meetUrl =
    data.hangoutLink ??
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return { id: data.id, htmlLink: data.htmlLink, meetUrl };
}

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
};

// List events on a calendar within [timeMinIso, timeMaxIso] (expanded recurrences).
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<CalendarEvent[]> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMinIso);
  url.searchParams.set("timeMax", timeMaxIso);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Calendar events list failed: ${await res.text()}`);
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };
  return (data.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? "(busy)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay: !e.start?.dateTime,
    htmlLink: e.htmlLink ?? null
  }));
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId = "primary",
  sendUpdates: "all" | "externalOnly" | "none" = "all"
) {
  const cal = encodeURIComponent(calendarId);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(eventId)}`);
  url.searchParams.set("sendUpdates", sendUpdates);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  // 410 Gone = already deleted; treat as success.
  if (!res.ok && res.status !== 410) throw new Error(`Calendar event delete failed: ${await res.text()}`);
}

// ---- Google Forms ------------------------------------------------------- //

export type GoogleForm = {
  formId: string;
  title: string;
  // questionId -> question title, for labelling answers
  questions: Record<string, string>;
};

// Extract a form id from a raw id or a full Google Forms URL.
export function parseFormId(input: string): string {
  const m = input.match(/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
  return (m ? m[1] : input).trim();
}

export async function getGoogleForm(accessToken: string, formId: string): Promise<GoogleForm> {
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Google Forms get failed: ${await res.text()}`);
  const data = (await res.json()) as {
    info?: { title?: string; documentTitle?: string };
    items?: Array<{ title?: string; questionItem?: { question?: { questionId?: string } } }>;
  };
  const questions: Record<string, string> = {};
  for (const item of data.items ?? []) {
    const qid = item.questionItem?.question?.questionId;
    if (qid) questions[qid] = item.title ?? "Question";
  }
  return { formId, title: data.info?.title || data.info?.documentTitle || "Untitled form", questions };
}

export type FormResponse = {
  responseId: string;
  submittedAt: string | null;
  // question title -> answer text
  answers: Record<string, string>;
};

export async function listGoogleFormResponses(
  accessToken: string,
  form: GoogleForm
): Promise<FormResponse[]> {
  const res = await fetch(
    `https://forms.googleapis.com/v1/forms/${encodeURIComponent(form.formId)}/responses`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Google Forms responses failed: ${await res.text()}`);
  const data = (await res.json()) as {
    responses?: Array<{
      responseId: string;
      lastSubmittedTime?: string;
      answers?: Record<string, { textAnswers?: { answers?: Array<{ value?: string }> } }>;
    }>;
  };
  return (data.responses ?? []).map((r) => {
    const answers: Record<string, string> = {};
    for (const [qid, a] of Object.entries(r.answers ?? {})) {
      const label = form.questions[qid] ?? qid;
      answers[label] = (a.textAnswers?.answers ?? []).map((x) => x.value ?? "").filter(Boolean).join(", ");
    }
    return { responseId: r.responseId, submittedAt: r.lastSubmittedTime ?? null, answers };
  });
}

// Returns busy intervals (UTC ISO) on the given calendar within [timeMinIso, timeMaxIso].
export async function getFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: calendarId }]
    })
  });
  if (!res.ok) throw new Error(`Free/busy lookup failed: ${await res.text()}`);
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  return data.calendars?.[calendarId]?.busy ?? [];
}
