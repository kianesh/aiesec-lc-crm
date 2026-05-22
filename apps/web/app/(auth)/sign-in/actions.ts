"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "../../../lib/supabase/server";

const emailSchema = z.object({
  email: z.string().email()
});

export async function signInWithMagicLink(formData: FormData) {
  const input = emailSchema.parse({ email: formData.get("email") });
  const origin = headers().get("origin") ?? "";
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/sign-in?sent=${encodeURIComponent(input.email)}`);
}

export async function signInWithGoogle(formData: FormData) {
  const origin = headers().get("origin") ?? "";
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  }

  redirect(data.url);
}
