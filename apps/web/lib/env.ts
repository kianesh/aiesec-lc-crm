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
  ENCRYPTION_KEY: optionalHexKey
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
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
  });
}
