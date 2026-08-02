import { API_ERROR_STATUS, type ApiErrorBody, type ApiErrorCode } from "@aiesec/api-contract";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// Native clients don't send cookies and aren't same-origin, so every response
// carries permissive CORS headers. This is safe because the API is
// bearer-authenticated: there is no ambient credential a hostile page could
// ride on, and `credentials: "include"` requests are rejected by the wildcard.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Client-API",
  "Access-Control-Max-Age": "86400"
};

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: CORS_HEADERS });
}

export function jsonError(code: ApiErrorCode, message: string, details?: Record<string, string[]>) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status: API_ERROR_STATUS[code], headers: CORS_HEADERS });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function zodError(error: ZodError) {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    (details[path] ??= []).push(issue.message);
  }
  const first = error.issues[0];
  return jsonError("invalid_request", first?.message ?? "Invalid request", details);
}

/**
 * Wrap a handler so an unexpected throw becomes a 500 JSON body instead of
 * Next's HTML error page — a native client can only parse the former.
 */
export function withApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[mobile-api]", error);
      return jsonError("server_error", "Something went wrong. Please try again.");
    }
  };
}

/** ISO-8601 or null — the shape every date crosses the wire in. */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
