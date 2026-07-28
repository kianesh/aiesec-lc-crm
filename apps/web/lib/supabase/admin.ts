import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "../env";

// Service-role client for privileged operations (e.g. deleting an auth user).
// Returns null when the service role key isn't configured — callers degrade to
// app-data-only cleanup in that case.
export function createAdminClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
