# Auth And EXPA Setup

## Supabase Auth

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the deployed Vercel URL, not localhost.
3. Add these redirect URLs:

```text
http://localhost:3000/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
```

4. In Vercel, set `NEXT_PUBLIC_SITE_URL` to the deployed URL:

```text
NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
```

5. Enable **Email** magic links.
6. If magic-link emails still point to localhost, open **Authentication → Email Templates** and make sure the magic-link template uses the redirect URL token, not only the site URL. Supabase documents this as using `{{ .RedirectTo }}` when your app passes a redirect target.

## Google OAuth

The error `unsupported provider` means Google is not enabled in Supabase for this project.

1. Open **Authentication → Providers** in Supabase.
2. Enable **Google**.
3. Create a Google OAuth client in Google Cloud.
4. In the Google OAuth client, add the Supabase callback URL shown in the Supabase Google provider screen. It usually looks like:

```text
https://ojeqvrsjgcqzbldhryju.supabase.co/auth/v1/callback
```

5. Copy the Google Client ID and Client Secret back into Supabase.
6. Save the provider settings.

The app-level callback remains:

```text
https://your-vercel-domain.vercel.app/auth/callback
```

Google first returns to Supabase, then Supabase redirects back to the app.

## Database Migration

Apply migrations in order:

```text
packages/db/drizzle/0000_initial_schema.sql
packages/db/drizzle/0001_rls_policies.sql
packages/db/drizzle/0002_expa_analytics_snapshots.sql
```

`0001_rls_policies.sql` adds helper functions and RLS policies so rows are scoped to authenticated LC members.
`0002_expa_analytics_snapshots.sql` stores manual EXPA analytics snapshots for the EXPA Analytics page.

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

The current app supports a manual EXPA connection from **Integrations**:

1. Set `ENCRYPTION_KEY` in Vercel before saving credentials. It must be a 64-character hex string.
2. Redeploy after adding the env var.
3. Open **Integrations** in the app.
4. Enter the LC's EXPA committee ID.
5. Paste an EXPA access token.
6. Save, then use **Test connection**.
7. Open **EXPA Analytics** and use **Sync EXPA** to store the latest analytics snapshot.

Generate a local-safe encryption key with:

```bash
openssl rand -hex 32
```

OAuth connect/callback routes can replace the manual token form once the exact EXPA OAuth authorization and token endpoints are confirmed for your AIESEC app credentials.
