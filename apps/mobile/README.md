# AIESEC LC CRM — Mobile

Native iOS + Android app (Expo SDK 57 + expo-router) for the CRM in `apps/web`.

Architecture, phasing and the full API surface are in
[`docs/mobile-app-plan.md`](../../docs/mobile-app-plan.md).

## Running it

```bash
cp apps/mobile/.env.example apps/mobile/.env   # fill in the three values
npm install                                    # from the repo root
npm run dev --workspace @aiesec/web            # the API the app talks to
npm start --workspace @aiesec/mobile           # Metro; scan the QR in Expo Go
```

`EXPO_PUBLIC_API_URL` must be your machine's **LAN IP**, not `localhost` — a
phone or simulator resolves `localhost` to itself, not to your dev machine:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

After changing `.env`, restart Metro with `npx expo start -c`; `EXPO_PUBLIC_*`
values are inlined at bundle time.

## Signing in

Enter your email, then the 6-digit code Supabase emails you. Mobile uses an OTP
code rather than the web app's magic link because a link tapped in a mail client
opens the browser, not the app — routing it back would need universal links and
a custom dev build. Same Supabase user either way.

New accounts and new LCs are still created on the web app (`shouldCreateUser`
is off here), so a first-time member signs in on the web once, then the app
works.

## Layout

```
app/                     expo-router routes (file = screen)
  _layout.tsx            providers + signed-in/out gate + push wiring
  sign-in.tsx
  (tabs)/                Dashboard · Contacts · Inbox · Agenda · More
  contacts/[id].tsx      detail + inline edit
  contacts/new.tsx
  conversations/[id].tsx thread + composer
  appointments/[id].tsx  detail, intake answers, cancel/complete/no-show
  expa/index.tsx         funnel / openings / ML insights, sync from the phone
src/
  components/ui.tsx      Card, Button, Field, Badge, Avatar, states
  components/charts.tsx  svg funnel, line+band, percentile bar, spark bars
  lib/api.ts             bearer-authenticated fetch against /api/mobile/v1
  lib/queries.ts         React Query hooks, one per resource
  lib/session.tsx        Supabase session + /me + capabilities + LC switching
  lib/supabase.ts        client with a chunked SecureStore adapter
  lib/push.ts            Expo token registration + notification routing
  lib/use-push.ts        the hook that mounts it, once, from the root layout
  theme/tokens.ts        colours ported 1:1 from the web app's globals.css
```

## Notes for whoever picks this up next

- **`metro.config.js` has three monorepo-specific workarounds**, all commented
  in place: watching the workspace root; aliasing React to this app's copy
  (the web app hoists React 18 to the root, this app is on 19); and forcing
  `@supabase/supabase-js` to its CJS build (the ESM build's dynamic
  `import("@opentelemetry/api")` fails Hermes bytecode generation).
- **`expo-doctor` reports 3 failures and they're all benign** — two are network
  checks against Expo's servers, the third is that duplicate React. A dev
  export confirms exactly one React (19.2.3) reaches the bundle.
- **Push needs a real build.** Expo Go dropped remote push in SDK 53, so
  notifications only work via `eas build`. See
  [`docs/mobile-testflight.md`](../../docs/mobile-testflight.md).
- **Migration `0010_device_push_tokens.sql` must be applied** before push
  registration works; without it the register call 500s and the rest of the app
  carries on fine.
- **Permissions are enforced server-side.** `can("manage_contacts")` only hides
  UI; every mutating endpoint re-checks the LC's capability matrix.
- **Charts are hand-drawn on `react-native-svg`**, not a charting library. Four
  shapes cover everything so far; reach for a library only if that stops being
  true.
- **Reply delivery is Instagram-only**, matching the web app. Other channels
  record the message on the timeline and the composer says so. Both surfaces go
  through `apps/web/lib/conversations/send.ts`, so wiring up a new channel
  fixes them together.

## Building for distribution

`eas.json` is committed with development / preview / production profiles. Each
profile reads its `EXPO_PUBLIC_*` values from the matching EAS environment
rather than from a committed file.

Full walkthrough, including the Apple Developer steps:
[`docs/mobile-testflight.md`](../../docs/mobile-testflight.md).
