from pydantic import BaseModel, Field


class AnomalyDriver(BaseModel):
    metric: str = Field(..., description="Funnel stage that deviated, e.g. approved")
    value: float
    z: float = Field(..., description="Robust z-score (median/MAD) for that month")


class AnomalyPoint(BaseModel):
    month: str = Field(..., description="Month bucket, YYYY-MM")
    score: float = Field(..., description="Anomaly score — higher is more anomalous")
    is_anomaly: bool
    drivers: list[AnomalyDriver] = Field(default_factory=list)


class AnomalyResponse(BaseModel):
    lc_code: str
    method: str = Field(..., description="IsolationForest or robust-zscore (short history)")
    n_months: int
    anomaly_count: int
    points: list[AnomalyPoint]
    generated_at: str
