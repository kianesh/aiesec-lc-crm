import type { Capability } from "@aiesec/api-contract";
import type { NextRequest, NextResponse } from "next/server";
import { jsonError, withApiErrors } from "./respond";
import { getApiSession, type ApiSession } from "./session";

/**
 * Compose the three things every mobile route needs: JSON-shaped crash
 * handling, bearer authentication, and an optional capability assertion.
 *
 * ```ts
 * export const GET = authed(async (request, session) => jsonOk(...));
 * export const PATCH = authed(handler, { capability: "manage_contacts" });
 * ```
 */
export function authed<Ctx>(
  handler: (request: NextRequest, session: ApiSession, ctx: Ctx) => Promise<NextResponse>,
  opts?: { capability?: Capability }
) {
  return withApiErrors(async (request: NextRequest, ctx: Ctx) => {
    const result = await getApiSession(request);
    if (!result.ok) return jsonError(result.code, result.message);

    if (opts?.capability && !result.session.capabilities.has(opts.capability)) {
      return jsonError("forbidden", "Your role doesn't allow that in this LC.");
    }

    return handler(request, result.session, ctx);
  });
}

/** Route-segment config every mobile handler shares. */
export const MOBILE_ROUTE_CONFIG = {
  runtime: "nodejs",
  dynamic: "force-dynamic"
} as const;
