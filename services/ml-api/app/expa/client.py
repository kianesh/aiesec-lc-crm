"""Python EXPA GIS API client.

Mirrors packages/integrations/expa/src/index.ts with additions:
  - Client-credentials token management with lazy fetch
  - 401-triggered token refresh (one retry)
  - 429 exponential backoff with jitter (up to 6 attempts)
  - extract_metric: verbatim port of the TS extractMetric heuristic
  - _append_query_value: bracket-notation query-string builder (same as TS)
"""
import hashlib
import math
import random
import time
from typing import Any, Literal

import httpx

# ------------------------------------------------------------------ #
# Types                                                               #
# ------------------------------------------------------------------ #

FUNNEL_STATUSES: tuple[str, ...] = (
    "sign_up",
    "applied",
    "matched",
    "approved",
    "realized",
    "finished",
    "completed",
)

FunnelStatus = Literal[
    "sign_up", "applied", "matched", "approved", "realized", "finished", "completed"
]


# ------------------------------------------------------------------ #
# Exceptions                                                          #
# ------------------------------------------------------------------ #


class ExpaAuthError(Exception):
    pass


class ExpaApiError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


# ------------------------------------------------------------------ #
# Token manager                                                       #
# ------------------------------------------------------------------ #


class ExpaTokenManager:
    """Fetches and caches an EXPA client-credentials OAuth token.

    If initial_token is provided it is used as-is until a 401 triggers a
    refresh.  If both initial_token and client credentials are present, the
    token is used first and credentials are used for refresh.
    """

    TOKEN_URL = "https://auth.aiesec.org/oauth/token"

    def __init__(
        self,
        client_id: str = "",
        client_secret: str = "",
        initial_token: str = "",
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._token = initial_token

    def get(self) -> str:
        if not self._token:
            self._fetch()
        return self._token

    def refresh(self) -> str:
        """Force-discard the cached token and fetch a new one."""
        self._token = ""
        self._fetch()
        return self._token

    def _fetch(self) -> None:
        if not self._client_id or not self._client_secret:
            raise ExpaAuthError(
                "EXPA_CLIENT_ID and EXPA_CLIENT_SECRET must be set "
                "(or provide a pre-fetched EXPA_ACCESS_TOKEN)."
            )
        resp = httpx.post(
            self.TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
        if not resp.is_success:
            raise ExpaAuthError(
                f"Token request failed [{resp.status_code}]: {resp.text[:300]}"
            )
        self._token = resp.json()["access_token"]


# ------------------------------------------------------------------ #
# Client                                                              #
# ------------------------------------------------------------------ #


class ExpaClient:
    """Synchronous EXPA GIS API client.

    Uses httpx.Client under the hood.  Thread-safe as long as each thread
    constructs its own ExpaClient instance (or uses a thread-local).
    """

    BASE_URL = "https://gis-api.aiesec.org"
    # analyzeApplications (performance_v3, historical, entity_timeline) lives here
    ANALYTICS_URL = "https://analytics.api.aiesec.org"

    def __init__(
        self,
        token_manager: ExpaTokenManager,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._tokens = token_manager
        self._http = http_client or httpx.Client(timeout=30)

    @classmethod
    def from_env(
        cls,
        access_token: str = "",
        client_id: str = "",
        client_secret: str = "",
    ) -> "ExpaClient":
        """Construct from raw env-var values (priority: access_token > creds)."""
        return cls(ExpaTokenManager(client_id, client_secret, access_token))

    # ---------------------------------------------------------------- #
    # Public API methods                                                #
    # ---------------------------------------------------------------- #

    def get_committee(self, committee_id: str | int) -> dict:
        return self._request(f"/v2/committees/{committee_id}", {})

    def list_applications(
        self,
        *,
        page: int = 1,
        per_page: int = 25,
        filters: dict | None = None,
    ) -> dict:
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if filters:
            params["filters"] = filters
        return self._request("/v2/applications", params)

    def list_people(
        self,
        *,
        page: int = 1,
        per_page: int = 25,
        filters: dict | None = None,
    ) -> dict:
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if filters:
            params["filters"] = filters
        return self._request("/v2/people", params)

    def analyze_applications(
        self,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        programmes: list[str | int] | None = None,
        basic: dict | None = None,
        conversion_v2: dict | None = None,
        historical: dict | None = None,
        entity_timeline: dict | None = None,
        performance_v3: dict | None = None,
    ) -> dict:
        """Mirror of TS analyzeApplications — same named parameter groups.

        Each group maps to a top-level query-param namespace with bracket
        notation, e.g. performance_v3[office_id]=864.

        performance_v3 and historical route to ANALYTICS_URL; all other calls
        also go to ANALYTICS_URL as the analytics endpoint hosts /v2/applications/analyze.
        """
        params: dict[str, Any] = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if programmes:
            params["programmes"] = programmes
        if basic:
            params["basic"] = {
                "home_office_id": basic["home_office_id"],
                "type": basic.get("type", "person"),
            }
        if conversion_v2:
            params["conversion_v2"] = {
                "office_id": conversion_v2["office_id"],
                "status": conversion_v2["status"],
                "type": conversion_v2.get("type", "person"),
            }
        if historical:
            params["historical"] = {
                "office_id": historical["office_id"],
                "type": historical.get("type", "person"),
                "interval": historical.get("interval", "month"),
                "status": historical.get("status", "approved"),
                "projection": historical.get("projection", False),
            }
        if entity_timeline:
            params["entity_timeline"] = {
                "office_id": entity_timeline["office_id"],
                "type": entity_timeline.get("type", "person"),
                "status": entity_timeline.get("status", "approved"),
            }
        if performance_v3:
            params["performance_v3"] = {
                "office_id": performance_v3["office_id"],
            }
        return self._request(
            "/v2/applications/analyze", params, base_url=self.ANALYTICS_URL
        )

    # ---------------------------------------------------------------- #
    # Request machinery: 401-refresh + 429-backoff                     #
    # ---------------------------------------------------------------- #

    def _request(
        self,
        path: str,
        raw_params: dict,
        *,
        base_url: str | None = None,
        _token_refreshed: bool = False,
    ) -> dict:
        """GET with one 401-refresh and up to 6 attempts on 429."""
        url_base = base_url or self.BASE_URL
        for attempt in range(6):
            query: list[tuple[str, str]] = [("access_token", self._tokens.get())]
            _append_query_value(query, raw_params)

            try:
                resp = self._http.get(f"{url_base}{path}", params=query)
            except httpx.RequestError as exc:
                raise ExpaApiError(str(exc)) from exc

            if resp.status_code == 401 and not _token_refreshed:
                self._tokens.refresh()
                return self._request(
                    path, raw_params, base_url=base_url, _token_refreshed=True
                )

            if resp.status_code == 429:
                wait = min(2 ** attempt + random.uniform(0, 3), 120)
                time.sleep(wait)
                continue

            if not resp.is_success:
                body: Any = None
                try:
                    body = resp.json()
                except Exception:
                    pass
                # body may be a bare int/string (EXPA returns non-dict error bodies
                # for scope/token errors), so guard before calling .get()
                msg = (
                    (body.get("message") if isinstance(body, dict) else None)
                    or f"EXPA error {resp.status_code} — {body!r}"
                )
                raise ExpaApiError(msg, resp.status_code, body)

            return resp.json()

        raise ExpaApiError("Max retries exceeded after repeated 429 responses")


# ------------------------------------------------------------------ #
# Query param builder — bracket notation (mirrors TS appendQueryValue) #
# ------------------------------------------------------------------ #


def _append_query_value(
    result: list[tuple[str, str]],
    value: Any,
    key: str = "",
) -> None:
    """Recursively serialize nested dicts/lists into bracket-notation params.

    e.g. {"conversion_v2": {"office_id": 864}} →
         [("conversion_v2[office_id]", "864")]
    """
    if value is None:
        return
    if isinstance(value, dict):
        for k, v in value.items():
            child_key = f"{key}[{k}]" if key else k
            _append_query_value(result, v, child_key)
    elif isinstance(value, list):
        for item in value:
            result.append((f"{key}[]", str(item)))
    elif isinstance(value, bool):
        # must come before int check since bool is a subclass of int
        result.append((key, "true" if value else "false"))
    else:
        result.append((key, str(value)))


# ------------------------------------------------------------------ #
# extract_metric — verbatim port of TS extractMetric                 #
# ------------------------------------------------------------------ #

_PRIORITY_KEYS: tuple[str, ...] = (
    "count",
    "total",
    "value",
    "amount",
    "applications",
    "people",
    "data",
)


def extract_metric(value: Any) -> int:
    """Walk an unknown EXPA response shape to find a numeric count.

    Port of extractMetric in packages/integrations/expa/src/index.ts.
    Both the TS sync (Supabase) and Python pipeline (DuckDB) use this
    identical logic so stored values are always comparable.
    """
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)) and math.isfinite(value):
        return int(value)
    if isinstance(value, list):
        return len(value)
    if not value or not isinstance(value, dict):
        return 0
    for key in _PRIORITY_KEYS:
        nested = extract_metric(value.get(key))
        if nested > 0:
            return nested
    return sum(extract_metric(v) for v in value.values())


# ------------------------------------------------------------------ #
# performance_v3 funnel extractor                                     #
# ------------------------------------------------------------------ #

_FUNNEL_STATUS_KEYS: dict[str, str] = {
    "applied": "applied_total",
    "matched": "matched_total",
    "approved": "approved_total",
    "realized": "realized_total",
    "finished": "finished_total",
    "completed": "completed_total",
}


def extract_funnel_from_performance_v3(data: Any) -> dict[str, int]:
    """Extract per-stage counts from a performance_v3 EXPA response.

    Mirrors TS extractPerformanceApplicants:
        metric?.applicants?.value ?? metric?.doc_count ?? 0

    Returns a dict keyed by FunnelStatus (sign_up always 0 — not in
    performance_v3 response).
    """
    response: dict = (data or {}).get("response") or {}
    funnel: dict[str, int] = {"sign_up": 0}
    for stage, key in _FUNNEL_STATUS_KEYS.items():
        metric: dict = response.get(key) or {}
        value = (metric.get("applicants") or {}).get("value")
        if value is None:
            value = metric.get("doc_count")
        funnel[stage] = int(value) if isinstance(value, (int, float)) else 0
    return funnel


# ------------------------------------------------------------------ #
# LC anonymisation helper                                             #
# ------------------------------------------------------------------ #


def hash_lc_id(lc_id: str | int) -> str:
    """Return the opaque LC code used in all cross-LC API responses.

    Format: LC_<first-4-hex-chars-of-sha256(str(lc_id))>
    e.g. hash_lc_id(864) → "LC_a3f9" (illustrative)
    """
    digest = hashlib.sha256(str(lc_id).encode()).hexdigest()
    return f"LC_{digest[:4]}"
