# Getting the mobile app onto your phone

Two routes. Start with the first — it takes about five minutes and needs no
Apple account. Move to TestFlight when you want push notifications, other
testers, or the app to survive a laptop reboot.

| | Expo Go | TestFlight |
|---|---|---|
| Setup time | ~5 min | ~1–2 h first time |
| Apple Developer account ($99/yr) | no | **yes** |
| Push notifications | no | yes |
| Works away from your laptop | no | yes |
| Other people can test | no | yes (up to 100 internal) |

---

## Route 1 — Expo Go (today, no Apple account)

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in `.env`. `EXPO_PUBLIC_API_URL` must be your machine's LAN IP — a phone
resolves `localhost` to itself:

```bash
ipconfig getifaddr en0        # macOS
hostname -I | awk '{print $1}' # Linux
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

Then, in two terminals:

```bash
npm run dev          # Next.js on :3000
npm run dev:mobile   # Metro — scan the QR with the Camera app
```

Install **Expo Go** from the App Store first. Phone and laptop must be on the
same Wi-Fi.

Push notifications will not fire in Expo Go — SDK 53 removed remote push from
it. Everything else works.

---

## Route 2 — TestFlight

### What only you can do

These need credentials I don't have. Everything else is already committed.

1. **Apple Developer Program** — $99/yr at
   [developer.apple.com/programs](https://developer.apple.com/programs/).
   Approval takes 24–48 h, so start here. An Individual account is fine.
2. **Expo account** — free, [expo.dev](https://expo.dev).

### 1. Apply the database migration

Push tokens live in a new table. In the Supabase SQL editor, run:

```
packages/db/drizzle/0010_device_push_tokens.sql
```

It's idempotent, so re-running is safe. Skipping it means push registration
fails with a 500 and the app still works, just without notifications.

### 2. Deploy the web app

The phone talks to `/api/mobile/v1` over the internet, so the Next.js app has to
be deployed (Vercel) before a TestFlight build is useful. Note the production
URL — the next step needs it.

### 3. Link the project to EAS

```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas init          # creates the EAS project, writes extra.eas.projectId into app.json
```

Commit the `app.json` change — `getExpoPushTokenAsync` needs that project id in
release builds.

### 4. Create the build-time environment variables

`eas.json` points each profile at a matching EAS environment, so these are read
at build time rather than being committed:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<project>.supabase.co"
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"
eas env:create --environment preview --name EXPO_PUBLIC_API_URL           --value "https://<your-app>.vercel.app"
```

Repeat with `--environment production` when you move off internal builds. These
are all public-by-design values (they ship inside the app binary either way) —
the point of keeping them out of git is hygiene, not secrecy. Never put
`SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` here.

### 5. Set up push credentials

```bash
eas credentials --platform ios
```

Choose **Push Notifications: Manage your Apple Push Notifications Key** → let
EAS create one. It uploads the key to Expo, which is what lets the server's
Expo push calls reach APNs. One key covers every app on the account.

### 6. Build and submit

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

The build runs on Expo's macOS machines — no Mac needed on your end. First run
asks for your Apple ID and offers to create the bundle identifier
(`org.aiesec.lccrm`), signing certificate and provisioning profile; say yes to
all. Expect 15–30 minutes.

`eas submit` uploads to App Store Connect. Apple then processes for 5–15
minutes, and TestFlight emails you when the build is ready.

### 7. Install it

App Store Connect → your app → TestFlight → Internal Testing → add yourself as
a tester. Install **TestFlight** from the App Store, and the build appears
there.

Internal testing needs no App Review, so subsequent builds appear within
minutes.

### Shipping an update

```bash
eas build --platform ios --profile production && eas submit --platform ios --latest
```

`appVersionSource: "remote"` with `autoIncrement` means EAS handles build
numbers. Bump `version` in `app.json` for anything user-visible.

Once the native code has stopped changing, JS-only fixes can skip the whole
build with `eas update --branch production` — same channel, seconds instead of
half an hour.

---

## Testing push notifications

Push needs a real build (Route 2) and a physical device.

1. Open the app and accept the notification prompt. Registration happens
   automatically after sign-in — check the `device_push_tokens` table for a row.
2. Background the app.
3. Trigger one of the two events the server pushes on:
   - **New Instagram DM** — send a DM to the connected account. Requires the
     Meta webhook to be live (`docs/auth-and-expa-setup.md`).
   - **New booking** — book a slot on your LC's public `/book/<slug>` page.

Nothing arrived? In order of likelihood: migration 0010 not applied; permission
declined at the prompt; push credentials not set up (step 5); `EXPO_PUBLIC_API_URL`
pointing somewhere the phone can't reach.

---

## Known gaps at this point

- **Push covers two events.** New Instagram DMs and new bookings. Cancellations,
  join requests and campaign results don't push yet.
- **`expo-doctor` reports 3 failures**, all benign here:
  - two network checks that can't reach Expo's servers from this sandbox;
  - a duplicate-React warning, because the web app is on React 18 and the
    mobile app on React 19. `metro.config.js` aliases React to the mobile
    copy, and a dev export confirms exactly one React (19.2.3) in the bundle.
- **Android isn't wired for release.** The code is cross-platform and
  `eas build --platform android --profile preview` produces an installable APK,
  but Play Console setup isn't documented here.
