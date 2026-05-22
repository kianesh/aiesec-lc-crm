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
