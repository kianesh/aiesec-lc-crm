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
app/                    expo-router routes (file = screen)
  _layout.tsx           providers + signed-in/out gate
  sign-in.tsx
  (tabs)/               Dashboard · Contacts · Inbox · More
  contacts/[id].tsx     detail + inline edit
  contacts/new.tsx
  conversations/[id].tsx thread + composer
src/
  components/ui.tsx     Card, Button, Field, Badge, Avatar, states
  lib/api.ts            bearer-authenticated fetch against /api/mobile/v1
  lib/queries.ts        React Query hooks, one per resource
  lib/session.tsx       Supabase session + /me + capabilities + LC switching
  lib/supabase.ts       client with a chunked SecureStore adapter
  theme/tokens.ts       colours ported 1:1 from the web app's globals.css
```

## Notes for whoever picks this up next

- **`metro.config.js` has two monorepo-specific workarounds.** Both are
  commented in place: watching the workspace root, and forcing
  `@supabase/supabase-js` to its CJS build (the ESM build's dynamic
  `import("@opentelemetry/api")` fails Hermes bytecode generation).
- **Permissions are enforced server-side.** `can("manage_contacts")` only hides
  UI; every mutating endpoint re-checks the LC's capability matrix.
- **Reply delivery is Instagram-only**, matching the web app. Other channels
  record the message on the timeline and the composer says so. Both surfaces go
  through `apps/web/lib/conversations/send.ts`, so wiring up a new channel
  fixes them together.

## Building for distribution

```bash
npm i -g eas-cli && eas login
eas build --platform ios --profile preview      # TestFlight
eas build --platform android --profile preview  # internal track
```

`eas.json` isn't committed yet — `eas build:configure` writes it along with the
EAS project ID on first run.
