# Phase 0 Deploy Steps

## Supabase

1. Create a Supabase project.
2. Copy the project URL to `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the anon key to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Copy the service role key to `SUPABASE_SERVICE_ROLE_KEY`.
5. Copy the pooled Postgres connection string to `DATABASE_URL`.
6. Apply `packages/db/drizzle/0000_initial_schema.sql` in the Supabase SQL editor.

## Vercel

1. Create a new Vercel project from this repository.
2. Keep the repository root as the Vercel root directory.
3. Set install command to `npm install`.
4. Set build command to `npm run build`.
5. Set output directory to `apps/web/.next`.
6. Add all variables from `.env.example`.
7. Deploy and verify the home page renders `AIESEC LC CRM`.

## Local Verification

```bash
npm install
npm run typecheck
npm run build
```
