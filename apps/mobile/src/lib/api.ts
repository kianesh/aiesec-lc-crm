import { API_BASE_PATH, API_VERSION, isApiErrorBody, type ApiErrorCode } from "@aiesec/api-contract";
import { env } from "./env";
import { supabase } from "./supabase";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(code: ApiErrorCode, message: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the fix is to sign in again rather than retry. */
  get isAuthError() {
    return this.code === "unauthorized";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Scopes the request to an LC. Omit to use the caller's first membership. */
  lcId?: string | null;
  signal?: AbortSignal;
};

function buildUrl(path: string, options: RequestOptions) {
  const url = new URL(`${env.apiUrl}${API_BASE_PATH}${path}`);
  if (options.lcId) url.searchParams.set("lcId", options.lcId);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Authenticated fetch against /api/mobile/v1.
 *
 * `getSession()` returns the cached session and transparently refreshes it when
 * the access token is within its expiry window, so the bearer token attached
 * here is always current — there's no need for a 401-retry loop.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError("unauthorized", "You're signed out.", 401);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    Accept: "application/json",
    "X-Client-API": API_VERSION
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // A phone loses connectivity constantly; say so plainly instead of
    // surfacing "Network request failed".
    throw new ApiError("server_error", "Can't reach the server. Check your connection.", 0);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError(payload.error.code, payload.error.message, response.status, payload.error.details);
    }
    throw new ApiError("server_error", `Request failed (${response.status}).`, response.status);
  }

  return payload as T;
}
