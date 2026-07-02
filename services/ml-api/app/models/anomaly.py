"""Phase 4 — anomaly detection.

Flags unusual months in an LC's recruitment funnel. Each month is a feature
vector of the six funnel stages; an Isolation Forest scores how anomalous it is.
With too little history for the forest (<12 months) it falls back to a robust
z-score (median / MAD) rule. Either way we attach *drivers* — the stages whose
robust z-score deviated most — so an anomaly is explainable, not just flagged.
"""
from __future__ import annotations

import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

FUNNEL_STAGES = ["applied", "matched", "approved", "realized", "finished", "completed"]
_ARTIFACT_DIR = Path(__file__).parent.parent.parent / "artifacts"
_MIN_IFOREST = 12
_Z_FLAG = 3.5          # robust-zscore anomaly threshold (fallback method)
_Z_DRIVER = 2.0        # min |z| for a stage to be listed as a driver
_MAD_SCALE = 1.4826    # makes MAD a consistent estimator of stddev for normal data


def load_funnel_matrix(conn: Any, lc_code: str) -> pd.DataFrame:
    """Wide monthly matrix (rows=month, cols=funnel stages) for one LC."""
    rows = conn.execute(
        "SELECT period_start, metric, value FROM lc_snapshots "
        "WHERE lc_code = ? AND metric LIKE 'funnel.%' ORDER BY period_start",
        [lc_code],
    ).fetchall()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["period_start", "metric", "value"])
    df["period_start"] = pd.to_datetime(df["period_start"]).dt.to_period("M").dt.to_timestamp()
    df["stage"] = df["metric"].str.replace("funnel.", "", regex=False)
    wide = df.pivot_table(index="period_start", columns="stage", values="value", aggfunc="last")
    for stage in FUNNEL_STAGES:
        if stage not in wide.columns:
            wide[stage] = 0.0
    return wide[FUNNEL_STAGES].sort_index().fillna(0.0)


def _robust_z(X: pd.DataFrame) -> pd.DataFrame:
    """Per-column robust z-score using median and MAD (0 when a column is flat)."""
    med = X.median()
    mad = (X - med).abs().median() * _MAD_SCALE
    mad = mad.replace(0.0, np.nan)
    z = (X - med) / mad
    return z.fillna(0.0)


class AnomalyDetector:
    def __init__(self, contamination: float = 0.1):
        self.contamination = contamination
        self.method: str = ""
        self.columns: list[str] = []
        self._model = None
        self._med: pd.Series | None = None
        self._mad: pd.Series | None = None

    def fit(self, X: pd.DataFrame) -> "AnomalyDetector":
        self.columns = list(X.columns)
        self._med = X.median()
        self._mad = (X - self._med).abs().median() * _MAD_SCALE
        if len(X) >= _MIN_IFOREST:
            from sklearn.ensemble import IsolationForest

            self._model = IsolationForest(
                n_estimators=200, contamination=self.contamination, random_state=0
            ).fit(X.values)
            self.method = "IsolationForest"
        else:
            self._model = None
            self.method = "robust-zscore"
        return self

    def score(self, X: pd.DataFrame) -> pd.DataFrame:
        """Return per-month frame: score, is_anomaly, plus the raw features."""
        z = _robust_z(X)
        max_abs_z = z.abs().max(axis=1)

        if self._model is not None:
            # decision_function: higher = more normal; negate so higher = more anomalous.
            raw = -self._model.decision_function(X.values)
            is_anom = self._model.predict(X.values) == -1
            score = pd.Series(raw, index=X.index)
        else:
            score = max_abs_z
            is_anom = (max_abs_z > _Z_FLAG).values

        out = pd.DataFrame({"score": score.round(4), "is_anomaly": is_anom}, index=X.index)
        return out

    def drivers(self, X: pd.DataFrame, month) -> list[dict]:
        z = _robust_z(X).loc[month]
        picks = [
            {"metric": c, "value": float(X.loc[month, c]), "z": round(float(z[c]), 2)}
            for c in self.columns
            if abs(z[c]) >= _Z_DRIVER
        ]
        picks.sort(key=lambda d: abs(d["z"]), reverse=True)
        return picks[:3]

    # ---- persistence ---- #
    def save(self, lc_code: str) -> Path:
        _ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        path = _ARTIFACT_DIR / f"anomaly_{lc_code}.pkl"
        with open(path, "wb") as fh:
            pickle.dump(self, fh)
        return path

    @staticmethod
    def load(lc_code: str) -> "AnomalyDetector | None":
        path = _ARTIFACT_DIR / f"anomaly_{lc_code}.pkl"
        if not path.exists():
            return None
        with open(path, "rb") as fh:
            return pickle.load(fh)


def _month(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m")


def detect_lc(conn: Any, lc_code: str) -> dict | None:
    """Load funnel data, fit (or reuse artifact), return an anomaly report dict."""
    X = load_funnel_matrix(conn, lc_code)
    if X.empty:
        return None

    det = AnomalyDetector.load(lc_code)
    if det is None or det.columns != list(X.columns):
        det = AnomalyDetector().fit(X)

    scored = det.score(X)
    points = []
    for month, row in scored.iterrows():
        points.append(
            {
                "month": _month(month),
                "score": float(row["score"]),
                "is_anomaly": bool(row["is_anomaly"]),
                "drivers": det.drivers(X, month) if row["is_anomaly"] else [],
            }
        )

    return {
        "lc_code": lc_code,
        "method": det.method,
        "n_months": len(X),
        "anomaly_count": int(scored["is_anomaly"].sum()),
        "points": points,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
