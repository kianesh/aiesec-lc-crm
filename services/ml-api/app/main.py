from fastapi import FastAPI

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
