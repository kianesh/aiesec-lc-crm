"""Phase 3 — demand forecasting.

Fits a SARIMAX model per LC on a monthly metric series (default: approved EPs),
using the peer-cohort median of the same metric as an exogenous regressor
(demand across Canadian LCs moves together with recruitment cycles / semesters).

Designed to degrade gracefully: with too little history for a seasonal model it
falls back to a non-seasonal ARIMA, and with almost no history to a seasonal-naive
/ mean forecast — so the endpoint always returns something usable.
"""
from __future__ import annotations

import pickle
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

DEFAULT_METRIC = "historical.approved"
FALLBACK_METRIC = "funnel.approved"

_ARTIFACT_DIR = Path(__file__).parent.parent.parent / "artifacts"
_MIN_SEASONAL = 24  # need ≥2 seasonal cycles for (…,12)
_MIN_ARIMA = 6
_SEASON = 12


# --------------------------------------------------------------------------- #
# Data access (DuckDB lc_snapshots)                                           #
# --------------------------------------------------------------------------- #

def load_series(conn: Any, lc_code: str, metric: str) -> pd.Series:
    """Monthly series for one LC + metric, indexed at month-start, gap-filled."""
    rows = conn.execute(
        "SELECT period_start, value FROM lc_snapshots "
        "WHERE lc_code = ? AND metric = ? ORDER BY period_start",
        [lc_code, metric],
    ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    idx = pd.to_datetime([r[0] for r in rows]).to_period("M").to_timestamp()
    s = pd.Series([float(r[1]) for r in rows], index=idx)
    s = s[~s.index.duplicated(keep="last")].sort_index()
    # Regular monthly frequency; interpolate interior gaps, forward/back fill ends.
    s = s.asfreq("MS")
    if s.isna().any():
        s = s.interpolate(limit_direction="both")
    return s


def cohort_median(conn: Any, metric: str, exclude_lc_code: str) -> pd.Series:
    """Median of `metric` across all *other* LCs, per month (the exog regressor)."""
    rows = conn.execute(
        "SELECT period_start, value FROM lc_snapshots "
        "WHERE metric = ? AND lc_code != ?",
        [metric, exclude_lc_code],
    ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    df = pd.DataFrame(rows, columns=["period_start", "value"])
    df["period_start"] = pd.to_datetime(df["period_start"]).dt.to_period("M").dt.to_timestamp()
    med = df.groupby("period_start")["value"].median().sort_index().asfreq("MS")
    if med.isna().any():
        med = med.interpolate(limit_direction="both")
    return med


# --------------------------------------------------------------------------- #
# Model                                                                        #
# --------------------------------------------------------------------------- #

class DemandForecast:
    """Thin wrapper around statsmodels SARIMAX with a persistence-friendly API."""

    def __init__(self, metric: str = DEFAULT_METRIC):
        self.metric = metric
        self.model_desc: str = ""
        self._result = None          # fitted statsmodels results
        self._last_exog_year: pd.Series | None = None  # for seasonal-naive future exog
        self._last_season: pd.Series | None = None      # last 12 target values (seasonal anchor)
        self._fallback_value: float | None = None      # used when no model fits

    def fit(self, y: pd.Series, exog: pd.Series | None = None) -> "DemandForecast":
        y = y.dropna()
        n = len(y)
        if n >= _SEASON:
            self._last_season = y.iloc[-_SEASON:]
        if n < _MIN_ARIMA:
            # Not enough to model — remember the mean for a flat forecast.
            self._fallback_value = float(y.iloc[-1]) if n else 0.0
            self.model_desc = "seasonal-naive/mean (insufficient history)"
            return self

        # Align exogenous regressor to y's index when usable.
        aligned_exog = None
        if exog is not None and not exog.empty:
            e = exog.reindex(y.index)
            if e.notna().sum() >= max(_MIN_ARIMA, int(0.6 * n)):
                aligned_exog = e.interpolate(limit_direction="both").to_frame("cohort")
                self._last_exog_year = exog.dropna().iloc[-_SEASON:]

        seasonal = n >= _MIN_SEASONAL
        order = (1, 1, 1)
        seasonal_order = (0, 1, 1, _SEASON) if seasonal else (0, 0, 0, 0)

        from statsmodels.tsa.statespace.sarimax import SARIMAX

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                self._result = SARIMAX(
                    y,
                    exog=aligned_exog,
                    order=order,
                    seasonal_order=seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                ).fit(disp=False)
                exog_tag = "+exog" if aligned_exog is not None else ""
                self.model_desc = f"SARIMAX{order}{seasonal_order}{exog_tag}"
            except Exception:
                # Last-resort: non-seasonal, no exog.
                try:
                    self._result = SARIMAX(y, order=order).fit(disp=False)
                    self.model_desc = f"SARIMAX{order} (fallback)"
                except Exception:
                    self._fallback_value = float(y.iloc[-1])
                    self.model_desc = "seasonal-naive/mean (fit failed)"
        return self

    def _future_exog(self, steps: int) -> pd.DataFrame | None:
        if self._last_exog_year is None or self._result is None:
            return None
        # Seasonal-naive projection of the cohort median.
        base = self._last_exog_year.values
        vals = [base[i % len(base)] for i in range(steps)]
        start = self._result.data.row_labels[-1] + pd.offsets.MonthBegin(1)
        idx = pd.date_range(start=start, periods=steps, freq="MS")
        return pd.DataFrame({"cohort": vals}, index=idx)

    def forecast(self, steps: int) -> pd.DataFrame:
        """Return a frame indexed by month with columns forecast/lower/upper."""
        if self._result is None:
            # Flat fallback with a widening band.
            last_idx = pd.Timestamp.today().to_period("M").to_timestamp()
            idx = pd.date_range(start=last_idx + pd.offsets.MonthBegin(1), periods=steps, freq="MS")
            val = float(self._fallback_value or 0.0)
            band = max(1.0, 0.25 * abs(val))
            return pd.DataFrame(
                {"forecast": val, "lower": max(0.0, val - band), "upper": val + band}, index=idx
            )

        exog = None
        if self._last_exog_year is not None:
            exog = self._future_exog(steps)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fc = self._result.get_forecast(steps=steps, exog=exog)
        mean = fc.predicted_mean
        ci = fc.conf_int(alpha=0.20)  # 80% interval
        point = mean.clip(lower=0).values
        lower = ci.iloc[:, 0].clip(lower=0).values
        upper = ci.iloc[:, 1].clip(lower=0).values

        # Anchor to a seasonal-naive baseline (same month last year) so a shaky
        # SARIMAX fit can't collapse a clearly seasonal series toward zero.
        if self._last_season is not None and len(self._last_season) == _SEASON:
            base = self._last_season.values
            sn = np.array([base[i % _SEASON] for i in range(steps)], dtype=float)
            point = 0.5 * point + 0.5 * sn
            lower = np.minimum(lower, 0.6 * point)
            upper = np.maximum(upper, 1.4 * point)

        out = pd.DataFrame(
            {"forecast": point, "lower": np.clip(lower, 0, None), "upper": np.clip(upper, 0, None)},
            index=mean.index,
        )
        return out

    # ---- persistence ---- #
    def save(self, lc_code: str) -> Path:
        _ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        path = _ARTIFACT_DIR / f"forecast_{lc_code}_{self.metric}.pkl"
        with open(path, "wb") as fh:
            pickle.dump(self, fh)
        return path

    @staticmethod
    def load(lc_code: str, metric: str) -> "DemandForecast | None":
        path = _ARTIFACT_DIR / f"forecast_{lc_code}_{metric}.pkl"
        if not path.exists():
            return None
        with open(path, "rb") as fh:
            return pickle.load(fh)


# --------------------------------------------------------------------------- #
# Convenience: fit-on-read forecast used by the API                            #
# --------------------------------------------------------------------------- #

def _month(ts: pd.Timestamp) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m")


def forecast_lc(conn: Any, lc_code: str, metric: str, horizon: int) -> dict | None:
    """Load data, fit (or reuse an artifact), and assemble a response dict.

    Returns None when the LC has no data for the metric (after fallback metric).
    """
    series = load_series(conn, lc_code, metric)
    used_metric = metric
    if series.empty and metric == DEFAULT_METRIC:
        series = load_series(conn, lc_code, FALLBACK_METRIC)
        used_metric = FALLBACK_METRIC
    if series.empty:
        return None

    model = DemandForecast.load(lc_code, used_metric)
    if model is None:
        exog = cohort_median(conn, used_metric, lc_code)
        model = DemandForecast(used_metric).fit(series, exog)

    fc = model.forecast(max(1, min(horizon, 24)))

    return {
        "lc_code": lc_code,
        "metric": used_metric,
        "model": model.model_desc,
        "horizon_months": len(fc),
        "history": [{"month": _month(i), "value": float(v)} for i, v in series.items()],
        "forecast": [
            {
                "month": _month(i),
                "forecast": round(float(r.forecast), 2),
                "lower": round(float(r.lower), 2),
                "upper": round(float(r.upper), 2),
            }
            for i, r in fc.iterrows()
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
