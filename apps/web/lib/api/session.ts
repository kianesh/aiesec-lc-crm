import type { Capability } from "@aiesec/api-contract";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getMemberCapabilities, getMemberships, type Membership } from "../auth";
import { getPublicEnv } from "../env";

export type ApiSession = {
  userId: string;
  email: string;
  memberships: Membership[];
  /** The LC this request operates on — from ?lcId=, else the first membership. */
  membership: Membership;
  capabilities: Set<Capability>;
};

export type ApiSessionFailure = { code: "unauthorized" | "forbidden"; message: string };

export type ApiSessionResult = { ok: true; session: ApiSession } | { ok: false } & ApiSessionFailure;

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Authenticate a mobile API request from its `Authorization: Bearer <jwt>`
 * header. Unlike the web app there are no cookies to read, so this never
 * redirects — callers turn a failure into a JSON error.
 *
 * The token is verified against Supabase (`auth.getUser(jwt)` checks the
 * signature and expiry server-side); we never trust a locally-decoded claim.
 */
export async function getApiSession(request: NextRequest): Promise<ApiSessionResult> {
  const token = bearerToken(request);
  if (!token) return { ok: false, code: "unauthorized", message: "Missing bearer token." };

  const env = getPublicEnv();
  const supabase = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) return { ok: false, code: "unauthorized", message: "Session expired. Sign in again." };

  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) {
    return {
      ok: false,
      code: "forbidden",
      message: "You're not a member of a Local Committee yet. Finish onboarding on the web app."
    };
  }

  const requestedLcId = new URL(request.url).searchParams.get("lcId");
  const membership = requestedLcId ? memberships.find((m) => m.lcId === requestedLcId) : memberships[0];
  if (!membership) {
    return { ok: false, code: "forbidden", message: "You don't have access to that Local Committee." };
  }

  const capabilities = await getMemberCapabilities(membership.lcId, membership);

  return {
    ok: true,
    session: {
      userId: user.id,
      email: user.email ?? "",
      memberships,
      membership,
      capabilities
    }
  };
}

export function hasCapability(session: ApiSession, capability: Capability) {
  return session.capabilities.has(capability);
}
