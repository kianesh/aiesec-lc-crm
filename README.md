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

## Deploy

1. Create a Supabase project and copy its URL, anon key, service role key, and pooled Postgres connection string.
2. Create a Vercel project with root directory set to this repository.
3. Add all variables from `.env.example` in Vercel Project Settings.
4. Deploy with Vercel. The build command is `npm run build`.
5. Apply the database migration to Supabase before Phase 1 auth work begins.
