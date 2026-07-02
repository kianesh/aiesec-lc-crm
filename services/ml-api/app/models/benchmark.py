"""Phase 5 — peer benchmarking and funnel drop-off ("churn") risk.

Both work off the anonymized multi-LC funnel snapshots in DuckDB:

- peer_benchmark: where an LC's latest funnel numbers sit within the cohort
  (percentile + rank + cohort median), per stage.
- churn_risk: stage-to-stage conversion for the LC vs the cohort median, flagging
  the transitions where it loses the most people relative to peers. This is the
  aggregate, data-available reading of "churn" — per-EP churn would require the
  entityTimeline records the Phase 0 probe checks for, and is a later extension.

All peer identities stay anonymized (LC_xxxx); only the requesting LC's own
values are returned in cleartext.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

FUNNEL_ORDER = ["applied", "matched", "approved", "realized", "finished", "completed"]
_TRANSITIONS = [
    ("applied", "matched"),
    ("matched", "approved"),
    ("approved", "realized"),
    ("realized", "finished"),
]


def load_latest_funnel(conn: Any) -> dict[str, tuple[pd.Timestamp, dict[str, float]]]:
    """Each LC's most-recent month of funnel values: lc_code -> (period, {stage: value})."""
    rows = conn.execute(
        "SELECT lc_code, period_start, metric, value FROM lc_snapshots WHERE metric LIKE 'funnel.%'"
    ).fetchall()
    if not rows:
        return {}
    df = pd.DataFrame(rows, columns=["lc_code", "period_start", "metric", "value"])
    df["period_start"] = pd.to_datetime(df["period_start"])
    df["stage"] = df["metric"].str.replace("funnel.", "", regex=False)
    latest = df.groupby("lc_code")["period_start"].transform("max")
    df = df[df["period_start"] == latest]
    out: dict[str, tuple[pd.Timestamp, dict[str, float]]] = {}
    for lc, g in df.groupby("lc_code"):
        out[str(lc)] = (g["period_start"].iloc[0], dict(zip(g["stage"], g["value"].astype(float))))
    return out


def _month(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m")


def peer_benchmark(conn: Any, lc_code: str) -> dict | None:
    data = load_latest_funnel(conn)
    if lc_code not in data:
        return None
    target_period, _ = data[lc_code]

    metrics = []
    for stage in FUNNEL_ORDER:
        vals = {lc: st[stage] for lc, (_, st) in data.items() if stage in st}
        if lc_code not in vals:
            continue
        tv = vals[lc_code]
        series = list(vals.values())
        n = len(series)
        percentile = round(100.0 * sum(1 for v in series if v <= tv) / n, 1)
        rank = sum(1 for v in series if v > tv) + 1
        peers = [v for lc2, v in vals.items() if lc2 != lc_code]
        cohort_median = float(np.median(peers)) if peers else float(tv)
        metrics.append(
            {
                "metric": f"funnel.{stage}",
                "value": float(tv),
                "cohort_median": round(cohort_median, 2),
                "percentile": percentile,
                "rank": rank,
                "cohort_size": n,
            }
        )

    return {
        "lc_code": lc_code,
        "period": _month(target_period),
        "cohort_size": len(data),
        "metrics": metrics,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _rate(stages: dict[str, float], a: str, b: str) -> float:
    va = stages.get(a, 0.0)
    vb = stages.get(b, 0.0)
    return min(1.0, vb / va) if va > 0 else 0.0


def churn_risk(conn: Any, lc_code: str) -> dict | None:
    data = load_latest_funnel(conn)
    if lc_code not in data:
        return None
    period, stages = data[lc_code]

    # Cohort median conversion rate per transition (peers only).
    cohort: dict[tuple[str, str], list[float]] = {t: [] for t in _TRANSITIONS}
    for lc, (_, st) in data.items():
        if lc == lc_code:
            continue
        for t in _TRANSITIONS:
            if st.get(t[0], 0.0) > 0:
                cohort[t].append(_rate(st, *t))

    conversions = []
    gaps = []  # (transition_label, gap, cohort_median_rate)
    for t in _TRANSITIONS:
        r = _rate(stages, *t)
        cm = float(np.median(cohort[t])) if cohort[t] else r
        gap = max(0.0, cm - r)
        label = f"{t[0]}->{t[1]}"
        gaps.append((label, gap, cm))
        if cm > 0 and r < cm * 0.7:
            risk = "high"
        elif cm > 0 and r < cm * 0.9:
            risk = "medium"
        else:
            risk = "low"
        conversions.append(
            {
                "transition": label,
                "rate": round(r, 3),
                "cohort_median_rate": round(cm, 3),
                "drop_off": round(1 - r, 3),
                "risk": risk,
            }
        )

    rel = [g / cm for (_, g, cm) in gaps if cm > 0]
    risk_score = round(min(1.0, float(np.mean(rel))) if rel else 0.0, 3)
    overall = "high" if risk_score >= 0.30 else "medium" if risk_score >= 0.15 else "low"
    weakest = max(gaps, key=lambda x: x[1])[0] if gaps and max(g for _, g, _ in gaps) > 0 else None

    return {
        "lc_code": lc_code,
        "period": _month(period),
        "overall_risk": overall,
        "risk_score": risk_score,
        "weakest_transition": weakest,
        "conversions": conversions,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
