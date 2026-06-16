import { NextResponse, type NextRequest } from "next/server";
import { ensureUserProfile } from "../../../lib/auth";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
    // Create/refresh the profile row once, at sign-in, instead of on every page.
    await ensureUserProfile().catch(() => undefined);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
