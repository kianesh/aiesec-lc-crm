from fastapi import Depends, FastAPI, HTTPException, Query, status

from app.auth import require_api_key
from app.db.duckdb import get_connection
from app.models.anomaly import detect_lc
from app.models.forecast import DEFAULT_METRIC, forecast_lc
from app.schemas.anomaly import AnomalyResponse
from app.schemas.forecast import ForecastResponse
from app.schemas.health import HealthResponse

app = FastAPI(
    title="AIESEC ML API",
    description=(
        "Demand forecasting, anomaly detection, and peer benchmarking "
        "for AIESEC Local Committees."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health() -> HealthResponse:
    """Liveness probe — no auth required."""
    return HealthResponse(status="ok")


@app.get(
    "/forecast-demand/{lc_id}",
    response_model=ForecastResponse,
    tags=["forecast"],
    dependencies=[Depends(require_api_key)],
)
def forecast_demand(
    lc_id: int,
    metric: str = Query(DEFAULT_METRIC, description="Metric to forecast (e.g. historical.approved, funnel.approved)"),
    horizon: int = Query(6, ge=1, le=24, description="Months to forecast ahead"),
) -> ForecastResponse:
    """Phase 3 — monthly demand forecast for one LC (SARIMAX + cohort exog).

    `lc_id` is the raw EXPA committee id; it is hashed to the anonymized
    `LC_xxxx` code internally so no raw peer identity is exposed.
    """
    from app.expa.client import hash_lc_id

    lc_code = hash_lc_id(lc_id)
    conn = get_connection()
    try:
        result = forecast_lc(conn, lc_code, metric, horizon)
    finally:
        conn.close()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No snapshot data for LC {lc_code} / metric '{metric}'. Run the backfill first.",
        )
    return ForecastResponse(**result)


@app.get(
    "/anomalies/{lc_id}",
    response_model=AnomalyResponse,
    tags=["anomaly"],
    dependencies=[Depends(require_api_key)],
)
def anomalies(lc_id: int) -> AnomalyResponse:
    """Phase 4 — flag anomalous months in an LC's recruitment funnel.

    Each month is scored by an Isolation Forest (or a robust z-score rule when
    history is short); anomalous months include the funnel stages that drove them.
    """
    from app.expa.client import hash_lc_id

    lc_code = hash_lc_id(lc_id)
    conn = get_connection()
    try:
        result = detect_lc(conn, lc_code)
    finally:
        conn.close()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No funnel data for LC {lc_code}. Run the backfill first.",
        )
    return AnomalyResponse(**result)
