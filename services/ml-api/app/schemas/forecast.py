from pydantic import BaseModel, Field


class HistoryPoint(BaseModel):
    month: str = Field(..., description="Month bucket, YYYY-MM")
    value: float


class ForecastPoint(BaseModel):
    month: str = Field(..., description="Month bucket, YYYY-MM")
    forecast: float
    lower: float = Field(..., description="Lower bound of the confidence interval")
    upper: float = Field(..., description="Upper bound of the confidence interval")


class ForecastResponse(BaseModel):
    lc_code: str = Field(..., description="Anonymized LC identifier (LC_xxxx)")
    metric: str = Field(..., description="Forecasted metric, e.g. historical.approved")
    model: str = Field(..., description="Fitted model description, e.g. SARIMAX(1,1,1)(0,1,1,12)+exog")
    horizon_months: int
    history: list[HistoryPoint]
    forecast: list[ForecastPoint]
    generated_at: str
