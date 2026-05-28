# Phase 0 Deploy Steps

## Supabase

1. Create a Supabase project.
2. Copy the project URL to `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the anon key to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Copy the service role key to `SUPABASE_SERVICE_ROLE_KEY`.
5. Copy the pooled Postgres connection string to `DATABASE_URL`.
6. Apply `packages/db/drizzle/0000_initial_schema.sql` in the Supabase SQL editor.

## Vercel

### 1. Import The GitHub Repo

1. Go to Vercel and open your dashboard.
2. Click **Add New...**.
3. Choose **Project**.
4. Under **Import Git Repository**, select:

```text
kianesh/aiesec-lc-crm
```

5. Click **Import**.

If Vercel cannot see the repository, connect your GitHub account or adjust GitHub repository access for the Vercel app.

### 2. Configure Project Settings

Use these settings on the import screen:

```text
Framework Preset: Next.js
Root Directory: ./
Build Command: npm run build
Install Command: npm install
Output Directory: apps/web/.next
Node.js Version: 20.x or newer
```

Keep **Root Directory** as the repository root. This repo is an npm workspace monorepo, and the root `package.json` is responsible for routing the build to `apps/web`.

The root `vercel.json` also defines these defaults:

```json 
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next"
}
```

### 3. Add Environment Variables

Before clicking deploy, open the **Environment Variables** section on the Vercel import screen.

Add every variable from `.env.example`. For Phase 0, these are the important ones:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ojeqvrsjgcqzbldhryju.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_or_secret_key
DATABASE_URL=your_supabase_postgres_connection_string
```

Set them for:

```text
Production
Preview
Development
```

The other integration variables can be added as empty placeholders for now, or added later before the phase that needs them:

```env
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_WEBHOOK_SIGNING_KEY=
EXPA_CLIENT_ID=
EXPA_CLIENT_SECRET=
EXPA_REDIRECT_URI=
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ENCRYPTION_KEY=
```

Do not commit real secrets to `.env.example`. Real values belong in `.env.local` locally and in Vercel environment variables for deployment.

### 4. Deploy

1. Click **Deploy**.
2. Wait for the build to finish.
3. Open the generated Vercel deployment URL.
4. Verify the page renders:

```text
AIESEC LC CRM
Phase 0 Scaffold
Ready for Phase 1
```

### 5. After Deploy

After the first deployment, go to **Project Settings** in Vercel and confirm:

```text
Git Repository: kianesh/aiesec-lc-crm
Production Branch: main
Framework Preset: Next.js
Build Command: npm run build
Install Command: npm install
Output Directory: apps/web/.next
```

Future pushes to `main` will trigger production deployments automatically.

### Troubleshooting

If Vercel says it cannot find `next`, the install probably did not run from the repository root. Confirm **Root Directory** is `./`.

If Vercel builds the wrong directory, confirm **Build Command** is `npm run build`, not `next build`.

If environment variables are missing, open **Project Settings → Environment Variables**, add the missing value, then redeploy from the **Deployments** tab.

If the deployment works but Supabase calls fail later, confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` are set in Vercel for the environment you are testing.

## Local Verification

```bash
npm install
npm run typecheck
npm run build
```
