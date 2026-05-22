import { z } from "zod";
import type { Result } from "@aiesec/lib";

const expaErrorSchema = z.object({
  error: z.unknown().optional(),
  message: z.string().optional()
}).passthrough();

export type ExpaClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type ExpaTokenOptions = {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
};

export type ExpaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export type ExpaListParams = {
  page?: number;
  perPage?: number;
  q?: string;
  filters?: Record<string, string | number | boolean | Array<string | number>>;
};

export class ExpaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ExpaApiError";
  }
}

const expaTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional()
}).passthrough();

export async function requestExpaClientCredentialsToken(
  options: ExpaTokenOptions
): Promise<Result<ExpaTokenResponse, ExpaApiError>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: options.clientId,
    client_secret: options.clientSecret
  });

  try {
    const response = await fetchImpl(options.tokenUrl ?? "https://auth.aiesec.org/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = expaErrorSchema.safeParse(payload);
      return {
        ok: false,
        error: new ExpaApiError(
          parsed.success && parsed.data.message ? parsed.data.message : "EXPA token request failed",
          response.status,
          payload
        )
      };
    }

    const parsed = expaTokenSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: new ExpaApiError("EXPA token response did not include an access token", response.status, payload) };
    }

    return { ok: true, data: parsed.data };
  } catch (error) {
    return {
      ok: false,
      error: new ExpaApiError(error instanceof Error ? error.message : "EXPA token request failed")
    };
  }
}

export class ExpaClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExpaClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? "https://gis-api.aiesec.org";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  listPeople(params: ExpaListParams = {}) {
    return this.get("/v2/people", params);
  }

  listOpportunities(params: ExpaListParams = {}) {
    return this.get("/v2/opportunities", params);
  }

  listApplications(params: ExpaListParams = {}) {
    return this.get("/v2/applications", params);
  }

  getCommittee(committeeId: string | number) {
    return this.get(`/v2/committees/${committeeId}`);
  }

  getCommitteeStatistics(committeeId: string | number) {
    return this.get(`/v2/committees/${committeeId}/statistics`);
  }

  getOpportunityStats(params: ExpaListParams = {}) {
    return this.get("/v2/opportunities/stats", params);
  }

  private async get<T = unknown>(path: string, params: ExpaListParams = {}): Promise<Result<T, ExpaApiError>> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("access_token", this.accessToken);
    if (params.page) url.searchParams.set("page", String(params.page));
    if (params.perPage) url.searchParams.set("per_page", String(params.perPage));
    if (params.q) url.searchParams.set("q", params.q);
    Object.entries(params.filters ?? {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(`filters[${key}][]`, String(item)));
      } else {
        url.searchParams.set(`filters[${key}]`, String(value));
      }
    });

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = expaErrorSchema.safeParse(body);
        return {
          ok: false,
          error: new ExpaApiError(
            parsed.success && parsed.data.message ? parsed.data.message : "EXPA request failed",
            response.status,
            body
          )
        };
      }

      return { ok: true, data: body as T };
    } catch (error) {
      return {
        ok: false,
        error: new ExpaApiError(error instanceof Error ? error.message : "EXPA network request failed")
      };
    }
  }
}
