import { z } from "zod";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalHexKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().regex(/^[a-f0-9]{64}$/i).optional()
);

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: optionalUrl,
  NEXT_PUBLIC_VERCEL_URL: optionalString
});

const serverEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  EXPA_CLIENT_ID: optionalString,
  EXPA_CLIENT_SECRET: optionalString,
  EXPA_REDIRECT_URI: optionalUrl,
  ENCRYPTION_KEY: optionalHexKey,
  // AI assistant
  ANTHROPIC_API_KEY: optionalString,
  // Google Workspace connector (Gmail, Drive, Contacts, Calendar)
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  // Notion connector
  NOTION_CLIENT_ID: optionalString,
  NOTION_CLIENT_SECRET: optionalString,
  // Instagram (Instagram API with Instagram Login) — messaging + content publishing
  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  // Resend transactional/marketing email
  RESEND_API_KEY: optionalString,
  RESEND_WEBHOOK_SECRET: optionalString, // Svix signing secret (whsec_...)
  RESEND_FROM_EMAIL: optionalString, // default verified sender, e.g. "AIESEC <team@your-domain.org>"
  // ML service (forecasting / anomaly / benchmarking) — the FastAPI ml-api
  ML_API_URL: optionalUrl, // e.g. https://ml-api.up.railway.app  (http://localhost:8000 in dev)
  ML_API_KEY: optionalString // Bearer token this app sends to the ml-api
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    EXPA_CLIENT_ID: process.env.EXPA_CLIENT_ID,
    EXPA_CLIENT_SECRET: process.env.EXPA_CLIENT_SECRET,
    EXPA_REDIRECT_URI: process.env.EXPA_REDIRECT_URI,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET,
    INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    ML_API_URL: process.env.ML_API_URL,
    ML_API_KEY: process.env.ML_API_KEY
  });
}
