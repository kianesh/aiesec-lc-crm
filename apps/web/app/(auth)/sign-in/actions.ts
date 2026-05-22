"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../../../lib/supabase/server";
import { getAuthCallbackUrl } from "../../../lib/site-url";

const emailSchema = z.object({
  email: z.string().email()
});

export async function signInWithMagicLink(formData: FormData) {
  const input = emailSchema.parse({ email: formData.get("email") });
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: {
      emailRedirectTo: getAuthCallbackUrl(next)
    }
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/sign-in?sent=${encodeURIComponent(input.email)}`);
}

export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl(next)
    }
  });

  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  }

  redirect(data.url);
}
