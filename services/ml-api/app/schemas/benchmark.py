from pydantic import BaseModel, Field


class MetricBenchmark(BaseModel):
    metric: str
    value: float
    cohort_median: float
    percentile: float = Field(..., description="0-100; where this LC sits in the cohort")
    rank: int = Field(..., description="1 = highest in the cohort")
    cohort_size: int


class PeerBenchmarkResponse(BaseModel):
    lc_code: str
    period: str = Field(..., description="Latest month compared, YYYY-MM")
    cohort_size: int
    metrics: list[MetricBenchmark]
    generated_at: str


class StageConversion(BaseModel):
    transition: str = Field(..., description="e.g. applied->matched")
    rate: float = Field(..., description="Conversion rate 0-1")
    cohort_median_rate: float
    drop_off: float = Field(..., description="1 - rate")
    risk: str = Field(..., description="low / medium / high vs the cohort")


class ChurnRiskResponse(BaseModel):
    lc_code: str
    period: str
    overall_risk: str
    risk_score: float = Field(..., description="0-1; higher = more drop-off vs cohort")
    weakest_transition: str | None
    conversions: list[StageConversion]
    generated_at: str
