# AIESEC LC CRM

Internal CRM and operations platform for AIESEC Local Committees.

## Phase 0

This scaffold provides a deployable empty Next.js app, monorepo package layout, strict TypeScript defaults, environment variable template, and the initial Drizzle migration for the Phase 1 data model.

## Local Development

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:3000`.

## Mobile app

`apps/mobile` is an Expo (React Native) companion app covering the dashboard,
contacts and the conversations inbox. It talks to the same database through a
bearer-authenticated JSON API at `/api/mobile/v1`, served by the Next.js app.

```bash
cp apps/mobile/.env.example apps/mobile/.env   # fill in the three values
npm run dev                                    # the API
npm run dev:mobile                             # Metro; scan the QR in Expo Go
```

See [`apps/mobile/README.md`](apps/mobile/README.md) to run it and
[`docs/mobile-app-plan.md`](docs/mobile-app-plan.md) for the architecture and
the remaining phases.

## Deploy

1. Create a Supabase project and copy its URL, anon key, service role key, and pooled Postgres connection string.
2. Create a Vercel project with root directory set to this repository.
3. Add all variables from `.env.example` in Vercel Project Settings.
4. Deploy with Vercel. The build command is `npm run build`.
5. Apply the database migration to Supabase before Phase 1 auth work begins.
