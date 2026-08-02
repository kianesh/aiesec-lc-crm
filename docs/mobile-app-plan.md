# AIESEC LC CRM — Mobile App Plan

A native iOS + Android companion to the existing Next.js CRM, living in the same
monorepo at `apps/mobile`.

## Why a new API layer is unavoidable

The web app talks to Postgres directly from React Server Components and mutates
through Next.js **server actions**. Neither is reachable from a native client:
server actions are an RSC-protocol detail bound to the browser, and shipping
`DATABASE_URL` to a phone is obviously not an option.

So the mobile app needs an HTTP surface. Rather than rewriting the data layer,
`/api/mobile/v1/*` route handlers reuse the exact same server-side helpers the
web pages already use (`getDb()`, `getDashboardData()`, `lib/permissions`,
`lib/connectors/*`). One data model, one authorization model, two front ends.

```
              ┌───────────────────────┐
              │   Supabase (auth+db)  │
              └───────────┬───────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │        apps/web (Next.js)          │
        │  ┌──────────────┬───────────────┐  │
        │  │ RSC + server │ /api/mobile/  │  │
        │  │   actions    │      v1       │  │
        │  └──────┬───────┴───────┬───────┘  │
        └─────────┼───────────────┼──────────┘
                  │               │
          browser (cookies)   phone (Bearer JWT)
                                  │
                        ┌─────────┴──────────┐
                        │  apps/mobile (Expo)│
                        └────────────────────┘
```

## Auth model

| | Web | Mobile |
|---|---|---|
| Session transport | Supabase cookies via `@supabase/ssr` | Supabase JWT in `Authorization: Bearer` |
| Storage | httpOnly cookies | `expo-secure-store` (Keychain / Keystore) |
| Sign-in | magic link + Google OAuth | **6-digit email OTP** + Google OAuth |
| Refresh | Next.js middleware | `supabase-js` auto-refresh |

Email OTP is used on mobile instead of a magic link because the link would open
in the phone's browser, not the app. Supabase sends the same email; it contains
both a link and a code, and the app asks for the code. No deep-link or universal
-link configuration required to ship, which keeps Expo Go usable for testing.

`lib/api/session.ts` builds a Supabase client from the request's bearer token,
calls `getUser()` (a real signature check against Supabase, not a local decode),
then resolves memberships and the LC capability matrix using the same
`getMemberships` / `getMemberCapabilities` helpers the web app uses. Every
endpoint is scoped to an `lcId` the caller is provably a member of, and mutating
endpoints additionally assert a `Capability`.

## Package layout

```
packages/api-contract/     zod schemas + types shared by API routes and the app
apps/web/lib/api/          bearer session, JSON/error helpers, CORS
apps/web/app/api/mobile/v1 route handlers
apps/mobile/               Expo SDK 57, expo-router, React Query
```

`@aiesec/api-contract` depends on nothing but `zod`, so Metro can bundle it
without dragging `drizzle-orm`/`postgres` into the app. The API routes parse
their inputs with the same schemas the app validates against — a contract
change breaks the typecheck on both sides at once.

## API surface (v1)

All routes are `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and take
`?lcId=` (defaulting to the caller's first membership).

| Method | Path | Capability | Notes |
|---|---|---|---|
| GET | `/me` | — | user, memberships, active LC, capabilities |
| GET | `/dashboard` | `view_analytics` | KPIs, pipeline, programmes, recent activity |
| GET | `/contacts` | — | `q`, `type`, `stage`, `limit`, `offset`; server-side filtering |
| POST | `/contacts` | `manage_contacts` | |
| GET | `/contacts/:id` | — | contact + tags + activity timeline |
| PATCH | `/contacts/:id` | `manage_contacts` | logs a `contact_activities` row |
| DELETE | `/contacts/:id` | `manage_contacts` | |
| GET | `/conversations` | — | `channel`, `status`, `assigned` filters |
| GET | `/conversations/:id` | — | thread + messages + linked contact; marks read |
| PATCH | `/conversations/:id` | — | status / assignee |
| POST | `/conversations/:id/messages` | — | sends via Instagram or Resend, mirrors web `sendReply` |

Errors are uniform: `{ error: { code, message } }` with `code` one of
`unauthorized | forbidden | not_found | invalid_request | server_error`.

Note: contact list filtering moves server-side for mobile (the web page loads
every contact and filters in memory). That's the right shape for a phone on a
mobile network, and the web page can adopt it later.

## Phases

**Phase 1 — "the core four" (this change)**
Sign-in, Dashboard, Contacts, Conversations. These are what a member actually
needs between classes: check the funnel, look someone up, answer a DM.

- [x] Shared API contract package
- [x] Bearer session + capability guards
- [x] `/api/mobile/v1` handlers for the four areas
- [x] Expo app: auth, themed design system, tab navigation
- [x] Dashboard, Contacts (list/search/detail/edit/create), Conversations (inbox/thread/reply)

**Phase 2 — appointments & agenda**
Today/upcoming appointments, detail, cancel/complete, and the dashboard agenda
widget. Add `expo-notifications` + a `device_push_tokens` table so a new booking
or inbound DM can push.

**Phase 3 — EXPA analytics**
Funnel and programme charts (`victory-native` or `react-native-svg`), ML
insights from `/api/ml/insights`, peer benchmarks.

**Phase 4 — social & email**
Social queue and composer with `expo-image-picker` (posting from a phone is the
one thing mobile does *better* than the web app), campaign list and stats.

**Phase 5 — offline & polish**
React Query persistence for read-only caches, optimistic reply sending, an
offline banner, deep links (`aiesec-crm://contacts/:id`) shared from the web app.

## Distribution

EAS Build → TestFlight (iOS) and internal-track Play Console (Android). During
Phase 1, Expo Go against a dev server is enough:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 npm start
```

`app.json` uses the `org.aiesec.lccrm` bundle identifier; EAS project ID is
filled in the first time `eas build` runs.

## Out of scope for now

- Editing LC settings, permissions and integrations — administrative work that
  belongs on a laptop. The app links out to the web app for these.
- The AI assistant widget (`/api/assistant`) — streaming SSE into React Native
  needs a polyfill; deferred to a later phase.
- Public booking pages (`/book/*`) — those are for external guests, not members.
