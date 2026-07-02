"""Phase 4 training — fit an Isolation Forest anomaly detector per LC.

    python -m app.training.train_anomaly [--lc-codes LC_ab12,LC_cd34] [--contamination 0.1]

Reads the monthly funnel matrix from data/benchmark.duckdb, fits one detector
per LC, saves a pickle to artifacts/, and logs to MLflow when available.
"""
from __future__ import annotations

import argparse

from app.db.duckdb import get_connection
from app.models.anomaly import AnomalyDetector, load_funnel_matrix


def _all_lc_codes(conn) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT lc_code FROM lc_snapshots WHERE metric LIKE 'funnel.%' ORDER BY lc_code"
    ).fetchall()
    return [r[0] for r in rows]


def main() -> None:
    ap = argparse.ArgumentParser(description="Train per-LC anomaly detectors.")
    ap.add_argument("--lc-codes", default="", help="Comma-separated LC codes; default = all in DuckDB")
    ap.add_argument("--contamination", type=float, default=0.1)
    args = ap.parse_args()

    conn = get_connection()
    codes = [c.strip() for c in args.lc_codes.split(",") if c.strip()] or _all_lc_codes(conn)
    if not codes:
        print("No funnel data in DuckDB. Run `just backfill-peer-lcs` first.")
        return

    try:
        import mlflow  # noqa: F401
        _mlflow = mlflow
        _mlflow.set_experiment("anomaly-detection")
    except Exception:
        _mlflow = None

    trained = skipped = 0
    for code in codes:
        X = load_funnel_matrix(conn, code)
        if X.empty:
            print(f"  {code}: no funnel data — skipped")
            skipped += 1
            continue
        det = AnomalyDetector(contamination=args.contamination).fit(X)
        path = det.save(code)
        n_anom = int(det.score(X)["is_anomaly"].sum())
        print(f"  {code}: {det.method}  n={len(X)}  anomalies={n_anom}  -> {path.name}")
        trained += 1

        if _mlflow is not None:
            try:
                with _mlflow.start_run(run_name=code):
                    _mlflow.log_params({"lc_code": code, "method": det.method, "n_months": len(X), "contamination": args.contamination})
                    _mlflow.log_metric("anomaly_count", n_anom)
                    _mlflow.log_artifact(str(path))
            except Exception:
                pass

    print(f"\nDone. Trained {trained}, skipped {skipped}.")


if __name__ == "__main__":
    main()
