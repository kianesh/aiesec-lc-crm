import { NextResponse, type NextRequest } from "next/server";
import { ensureUserProfile } from "../../../lib/auth";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  // The provider (or Supabase) can hand back an error instead of a code.
  const providerError =
    requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(providerError)}`, requestUrl.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=Missing+auth+code", requestUrl.origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Surface the real reason (e.g. PKCE verifier missing on a mismatched host)
    // instead of silently redirecting to a protected page that bounces back.
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
  }

  // Create/refresh the profile row once, at sign-in, instead of on every page.
  await ensureUserProfile().catch(() => undefined);

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
