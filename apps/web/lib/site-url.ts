import { headers } from "next/headers";

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    // Vercel's STABLE production domain (e.g. aiesec-lc-crm-web.vercel.app).
    // Preferred over VERCEL_URL, which is the per-deployment hostname
    // (…-<hash>.vercel.app) and breaks OAuth cookies / redirect allow-lists.
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    process.env.VERCEL_URL;

  if (configuredUrl) return normalizeUrl(configuredUrl);

  const origin = headers().get("origin");
  if (origin) return normalizeUrl(origin);

  return "http://localhost:3000";
}

export function getAuthCallbackUrl(next = "/dashboard") {
  const url = new URL("/auth/callback", getSiteUrl());
  url.searchParams.set("next", next);
  return url.toString();
}

function normalizeUrl(value: string) {
  // Strip ALL whitespace — a stray space (e.g. a trailing space pasted into
  // NEXT_PUBLIC_SITE_URL) otherwise ends up inside the redirect_uri and breaks
  // every OAuth flow ("Invalid redirect_uri"). Valid URLs contain no spaces.
  const cleaned = value.replace(/\s+/g, "");
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  return withProtocol.replace(/\/+$/, ""); // drop any trailing slash(es)
}
