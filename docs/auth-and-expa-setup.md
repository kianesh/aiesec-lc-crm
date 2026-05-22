# Auth And EXPA Setup

## Supabase Auth

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the deployed Vercel URL.
3. Add these redirect URLs:

```text
http://localhost:3000/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
```

4. Enable **Email** magic links.
5. Enable **Google** if you want Google sign-in.

## Database Migration

Apply migrations in order:

```text
packages/db/drizzle/0000_initial_schema.sql
packages/db/drizzle/0001_rls_policies.sql
```

`0001_rls_policies.sql` adds helper functions and RLS policies so rows are scoped to authenticated LC members.

## Auth Flow

- `/sign-in` sends magic links and starts Google OAuth.
- `/auth/callback` exchanges the Supabase auth code for a session.
- `/onboarding` creates the first Local Committee and owner membership.
- `/invite/[token]` accepts an invitation and creates LC membership.
- Protected app routes redirect unauthenticated users to `/sign-in`.

## EXPA

The EXPA integration boundary now lives in:

```text
packages/integrations/expa/src/index.ts
```

It wraps:

```text
/v2/people
/v2/opportunities
/v2/applications
/v2/committees/{committee_id}
/v2/committees/{committee_id}/statistics
/v2/opportunities/stats
```

The public status endpoint is:

```text
/api/integrations/expa/status
```

Next step: add the EXPA OAuth connect/callback routes once the exact OAuth authorization and token endpoints are confirmed for your AIESEC app credentials.
