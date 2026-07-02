"""Phase 3 training — fit a SARIMAX demand forecaster per LC and persist it.

    python -m app.training.train_forecast [--metric historical.approved] [--lc-codes LC_ab12,LC_cd34]

Reads monthly series from data/benchmark.duckdb, fits one model per LC (using
the peer-cohort median as an exogenous regressor), saves a pickle to artifacts/,
and logs params/metrics to MLflow when available.
"""
from __future__ import annotations

import argparse

from app.db.duckdb import get_connection
from app.models.forecast import (
    DEFAULT_METRIC,
    FALLBACK_METRIC,
    DemandForecast,
    cohort_median,
    load_series,
)


def _all_lc_codes(conn) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT lc_code FROM lc_snapshots WHERE metric IN (?, ?) ORDER BY lc_code",
        [DEFAULT_METRIC, FALLBACK_METRIC],
    ).fetchall()
    return [r[0] for r in rows]


def main() -> None:
    ap = argparse.ArgumentParser(description="Train per-LC demand forecast models.")
    ap.add_argument("--metric", default=DEFAULT_METRIC)
    ap.add_argument("--lc-codes", default="", help="Comma-separated LC codes; default = all in DuckDB")
    args = ap.parse_args()

    conn = get_connection()
    codes = [c.strip() for c in args.lc_codes.split(",") if c.strip()] or _all_lc_codes(conn)
    if not codes:
        print("No LC data found in DuckDB. Run `just backfill-peer-lcs` first.")
        return

    try:
        import mlflow  # noqa: F401
        _mlflow = mlflow
        _mlflow.set_experiment("demand-forecast")
    except Exception:
        _mlflow = None

    trained = 0
    skipped = 0
    for code in codes:
        series = load_series(conn, code, args.metric)
        used = args.metric
        if series.empty and args.metric == DEFAULT_METRIC:
            series = load_series(conn, code, FALLBACK_METRIC)
            used = FALLBACK_METRIC
        if series.empty:
            print(f"  {code}: no data — skipped")
            skipped += 1
            continue

        exog = cohort_median(conn, used, code)
        model = DemandForecast(used).fit(series, exog)
        path = model.save(code)
        aic = getattr(getattr(model, "_result", None), "aic", None)
        print(f"  {code}: {model.model_desc}  n={len(series)}  aic={aic}  -> {path.name}")
        trained += 1

        if _mlflow is not None:
            try:
                with _mlflow.start_run(run_name=f"{code}:{used}"):
                    _mlflow.log_params({"lc_code": code, "metric": used, "n_obs": len(series), "model": model.model_desc})
                    if aic is not None:
                        _mlflow.log_metric("aic", float(aic))
                    _mlflow.log_artifact(str(path))
            except Exception:
                pass

    print(f"\nDone. Trained {trained}, skipped {skipped}.")


if __name__ == "__main__":
    main()
