"""Seed the DuckDB store with realistic synthetic multi-LC data for demos.

    python -m app.training.seed_demo [--if-empty] [--months 30]

Generates ~30 months of monthly funnel data for the home LC + peers, with
university-cycle seasonality, a gentle growth trend, one injected anomaly on the
home LC, and a deliberately weak approved->realized conversion (so the churn/
drop-off endpoint has something to flag). No EXPA/network needed — this lets a
deployed ml-api serve rich forecasts/anomalies/benchmarks without a live token.

--if-empty  : only seed when lc_snapshots is empty (safe default for containers;
              a real backfill takes precedence).
"""
from __future__ import annotations

import argparse
from datetime import date, datetime

import numpy as np

from app.db.duckdb import get_connection
from app.expa.client import hash_lc_id

STAGES = ["applied", "matched", "approved", "realized", "finished", "completed"]

# lc_id -> (label, base applications/month at peak-neutral month)
LCS: dict[int, tuple[str, int]] = {
    1132: ("western", 34),   # home LC
    864: ("toronto", 48),
    1000: ("tmu", 30),
    1075: ("ubc", 52),
    1135: ("sfu", 26),
    1196: ("manitoba", 18),
    829: ("edmonton", 22),
    1319: ("laval", 20),
}

# University recruitment cycle: peaks in Sept/Oct and Jan/Feb, quiet in summer.
MONTH_MULT = {1: 1.3, 2: 1.2, 3: 0.9, 4: 0.7, 5: 0.5, 6: 0.4,
              7: 0.4, 8: 0.7, 9: 1.6, 10: 1.4, 11: 1.0, 12: 0.7}

# Peer stage-to-stage conversion (the home LC's realized rate is weakened below).
BASE_RATES = {"matched": 0.68, "approved": 0.66, "realized": 0.72, "finished": 0.82, "completed": 0.90}


def _month_start(offset_back: int) -> date:
    today = date.today().replace(day=1)
    total = today.year * 12 + (today.month - 1) - offset_back
    return date(total // 12, total % 12 + 1, 1)


def _month_end(d: date) -> date:
    nxt = date(d.year + (d.month // 12), d.month % 12 + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def seed(months: int = 36) -> int:
    conn = get_connection()
    conn.execute("DELETE FROM lc_snapshots")
    now = datetime.now()
    rows: list[list] = []

    # months: from (months) ago up to last completed month (offset 1).
    periods = [_month_start(k) for k in range(months, 0, -1)]

    for lc_id, (label, base) in LCS.items():
        lc_code = hash_lc_id(lc_id)
        rng = np.random.default_rng(lc_id)  # deterministic per LC
        realized_rate = 0.42 if lc_id == 1132 else BASE_RATES["realized"]  # home LC drop-off
        anomaly_idx = months - 6 if lc_id == 1132 else -1  # spike 6 months back

        for t, ps in enumerate(periods):
            pe = _month_end(ps)
            trend = 1.0 + 0.015 * t
            noise = float(rng.normal(1.0, 0.12))
            applied = base * MONTH_MULT[ps.month] * trend * max(0.4, noise)
            if t == anomaly_idx:
                applied *= 2.7  # injected anomaly on the home LC

            applied = max(0, round(applied))
            matched = max(0, round(applied * BASE_RATES["matched"] * max(0.5, float(rng.normal(1, 0.08)))))
            approved = max(0, round(matched * BASE_RATES["approved"] * max(0.5, float(rng.normal(1, 0.08)))))
            realized = max(0, round(approved * realized_rate * max(0.5, float(rng.normal(1, 0.08)))))
            finished = max(0, round(realized * BASE_RATES["finished"]))
            completed = max(0, round(finished * BASE_RATES["completed"]))
            values = {
                "applied": applied, "matched": matched, "approved": approved,
                "realized": realized, "finished": finished, "completed": completed,
            }

            for stage, v in values.items():
                rows.append([lc_code, lc_id, ps.isoformat(), pe.isoformat(), f"funnel.{stage}", float(v), now])
            # historical.approved mirrors the monthly approved series (forecast default).
            rows.append([lc_code, lc_id, ps.isoformat(), pe.isoformat(), "historical.approved", float(approved), now])

    conn.executemany(
        "INSERT INTO lc_snapshots (lc_code, lc_id_raw, period_start, period_end, metric, value, synced_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    return len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed synthetic demo data into DuckDB.")
    ap.add_argument("--if-empty", action="store_true", help="Only seed when lc_snapshots is empty")
    ap.add_argument("--months", type=int, default=36)
    args = ap.parse_args()

    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) FROM lc_snapshots").fetchone()[0]
    if args.if_empty and count > 0:
        print(f"lc_snapshots already has {count} rows — skipping demo seed (--if-empty).")
        return

    n = seed(args.months)
    lcs = conn.execute("SELECT COUNT(DISTINCT lc_code) FROM lc_snapshots").fetchone()[0]
    print(f"Seeded {n} rows across {lcs} LCs ({args.months} months).")


if __name__ == "__main__":
    main()
