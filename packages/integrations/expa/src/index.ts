import { z } from "zod";
import type { Result } from "@aiesec/lib";

const expaErrorSchema = z.object({
  error: z.unknown().optional(),
  message: z.string().optional()
}).passthrough();

export type ExpaClientOptions = {
  accessToken: string;
  baseUrl?: string;
  analyticsBaseUrl?: string;
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
  filters?: ExpaQueryValue;
  sort?: string;
};

export type ExpaQueryPrimitive = string | number | boolean;
export type ExpaQueryValue = ExpaQueryPrimitive | ExpaQueryPrimitive[] | { [key: string]: ExpaQueryValue | undefined };

export type ExpaAnalyticsParams = {
  startDate?: string;
  endDate?: string;
  programmes?: Array<string | number>;
  basic?: {
    homeOfficeId: string | number;
    type: "opportunity" | "person";
  };
  conversionV2?: {
    officeId: string | number;
    status: "sign_up" | "applied" | "matched" | "approved" | "realized" | "finished" | "completed";
    type?: "opportunity" | "person";
  };
  historical?: {
    officeId: string | number;
    type: "opportunity" | "person";
    interval: "day" | "week" | "month";
    status?: "approved" | "accepted" | "realized" | "completed";
    projection?: boolean;
  };
  entityTimeline?: {
    officeId: string | number;
    type: "opportunity" | "person";
    status: "approved" | "accepted" | "realized" | "completed";
  };
  performanceV3?: {
    officeId: string | number;
  };
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
  private readonly analyticsBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExpaClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? "https://gis-api.aiesec.org";
    this.analyticsBaseUrl = options.analyticsBaseUrl ?? "https://analytics.api.aiesec.org";
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
  
  search(params: ExpaListParams = {}) {
    return this.get("/v2/search", params);
  }

  searchOpportunities(params: ExpaListParams = {}) {
    return this.get("/v2/opportunities/search", params);
  }

  analyzeApplications(params: ExpaAnalyticsParams) {
    return this.get("/v2/applications/analyze", {
      start_date: params.startDate,
      end_date: params.endDate,
      programmes: params.programmes,
      basic: params.basic
        ? {
            home_office_id: params.basic.homeOfficeId,
            type: params.basic.type
          }
        : undefined,
      conversion_v2: params.conversionV2
        ? {
            office_id: params.conversionV2.officeId,
            status: params.conversionV2.status,
            type: params.conversionV2.type
          }
        : undefined,
      historical: params.historical
        ? {
            office_id: params.historical.officeId,
            type: params.historical.type,
            interval: params.historical.interval,
            status: params.historical.status,
            projection: params.historical.projection ?? false
          }
        : undefined,
      entity_timeline: params.entityTimeline
        ? {
            office_id: params.entityTimeline.officeId,
            type: params.entityTimeline.type,
            status: params.entityTimeline.status
          }
        : undefined,
      performance_v3: params.performanceV3
        ? {
            office_id: params.performanceV3.officeId
          }
        : undefined
    }, this.analyticsBaseUrl);
  }

  private async get<T = unknown>(
    path: string,
    params: Record<string, ExpaQueryValue | undefined> & ExpaListParams = {},
    baseUrl = this.baseUrl
  ): Promise<Result<T, ExpaApiError>> {
    const url = new URL(path, baseUrl);
    url.searchParams.set("access_token", this.accessToken);
    if (params.page) url.searchParams.set("page", String(params.page));
    if (params.perPage) url.searchParams.set("per_page", String(params.perPage));
    if (params.q) url.searchParams.set("q", params.q);
    if (params.sort) url.searchParams.set("sort", params.sort);

    Object.entries(params).forEach(([key, value]) => {
      if (["page", "perPage", "q", "sort"].includes(key)) return;
      appendQueryValue(url.searchParams, key === "filters" ? "filters" : key, value);
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

function appendQueryValue(searchParams: URLSearchParams, key: string, value: ExpaQueryValue | undefined) {
  if (value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item) => searchParams.append(`${key}[]`, String(item)));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      appendQueryValue(searchParams, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }

  searchParams.set(key, String(value));
}
