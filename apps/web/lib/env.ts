import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

const serverEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  EXPA_CLIENT_ID: z.string().min(1).optional(),
  EXPA_CLIENT_SECRET: z.string().min(1).optional(),
  EXPA_REDIRECT_URI: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional()
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    EXPA_CLIENT_ID: process.env.EXPA_CLIENT_ID,
    EXPA_CLIENT_SECRET: process.env.EXPA_CLIENT_SECRET,
    EXPA_REDIRECT_URI: process.env.EXPA_REDIRECT_URI,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
  });
}
