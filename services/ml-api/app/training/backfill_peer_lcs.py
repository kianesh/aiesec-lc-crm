"""Phase 2: Backfill peer LC snapshots into DuckDB.

For each LC in config/peer_lcs.yaml:
  1. Pull a performance_v3 snapshot (all funnel stages) for each calendar month
     in the backfill window.
  2. Pull the full historical monthly approved time series in a single call.
  3. Write anonymized metrics to data/benchmark.duckdb.
  4. Cache raw EXPA responses in lc_raw_cache — re-runs replay from cache
     without hitting EXPA again.

Privacy
-------
  - lc_snapshots uses opaque hashed IDs (LC_xxxx) for every LC including
    Western.  The raw ID is stored internally in lc_id_raw but never exposed
    via any API endpoint.
  - DuckDB lives under data/ which is gitignored.

Usage
-----
    cd services/ml-api
    python -m app.training.backfill_peer_lcs
    python -m app.training.backfill_peer_lcs --start-date 2023-01-01
    python -m app.training.backfill_peer_lcs --lc-ids 864,1000 --dry-run
"""

import argparse
import json
import sys
import time
from calendar import monthrange
from datetime import date
from pathlib import Path
from typing import Any

import yaml

_REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT))

from app.config import get_settings
from app.db.duckdb import get_connection
from app.expa.client import ExpaClient, extract_funnel_from_performance_v3, hash_lc_id

_CONFIG_PATH = Path(__file__).parent.parent / "config" / "peer_lcs.yaml"
_INTER_LC_SLEEP = 3.0   # seconds between LCs — avoids bursting the token
_INTER_CALL_SLEEP = 0.5  # seconds between successive calls for the same LC


# ------------------------------------------------------------------ #
# Month iteration helper                                              #
# ------------------------------------------------------------------ #

def _month_range(start: date, end: date) -> list[tuple[date, date]]:
    """Return (month_start, month_end) pairs from start's month to end's month."""
    periods = []
    year, month = start.year, start.month
    while date(year, month, 1) <= date(end.year, end.month, 1):
        last_day = monthrange(year, month)[1]
        periods.append((date(year, month, 1), date(year, month, last_day)))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return periods


# ------------------------------------------------------------------ #
# DuckDB helpers                                                      #
# ------------------------------------------------------------------ #

def _load_cache(conn, lc_id: int, period_start: str, key: str) -> dict | None:
    row = conn.execute(
        "SELECT response_json FROM lc_raw_cache "
        "WHERE lc_id_raw = ? AND period_start = ? AND endpoint_key = ?",
        [lc_id, period_start, key],
    ).fetchone()
    return json.loads(row[0]) if row else None


def _save_cache(
    conn, lc_id: int, period_start: str, period_end: str, key: str, data: dict
) -> None:
    conn.execute(
        """
        INSERT INTO lc_raw_cache
            (lc_id_raw, period_start, period_end, endpoint_key, response_json, cached_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (lc_id_raw, period_start, endpoint_key) DO UPDATE SET
            period_end    = excluded.period_end,
            response_json = excluded.response_json,
            cached_at     = CURRENT_TIMESTAMP
        """,
        [lc_id, period_start, period_end, key, json.dumps(data)],
    )


def _upsert_metric(
    conn,
    lc_code: str,
    lc_id: int,
    period_start: date,
    period_end: date,
    metric: str,
    value: float,
) -> None:
    conn.execute(
        """
        INSERT INTO lc_snapshots
            (lc_code, lc_id_raw, period_start, period_end, metric, value, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (lc_code, period_start, metric) DO UPDATE SET
            lc_id_raw  = excluded.lc_id_raw,
            period_end = excluded.period_end,
            value      = excluded.value,
            synced_at  = CURRENT_TIMESTAMP
        """,
        [lc_code, lc_id, period_start.isoformat(), period_end.isoformat(), metric, value],
    )


# ------------------------------------------------------------------ #
# Historical response parser                                          #
# ------------------------------------------------------------------ #

def _parse_historical_buckets(data: Any) -> list[tuple[date, int]]:
    """Extract (bucket_date, count) pairs from an EXPA historical response.

    EXPA returns monthly buckets; the exact nesting varies.  We check the
    common shapes and fall back gracefully.
    """
    if not data or not isinstance(data, dict):
        return []

    # Top-level data array — most common shape
    items: list = (
        data.get("data")
        or data.get("buckets")
        or data.get("results")
        or []
    )

    buckets: list[tuple[date, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        # Date field candidates
        raw_date = (
            item.get("date")
            or item.get("key_as_string")
            or item.get("key")
        )
        # Count field candidates
        count_raw = (
            item.get("doc_count")
            or item.get("count")
            or item.get("value")
            or 0
        )
        if not raw_date:
            continue
        try:
            bucket_date = date.fromisoformat(str(raw_date)[:10])
            buckets.append((bucket_date, int(count_raw)))
        except (ValueError, TypeError):
            continue

    return buckets


# ------------------------------------------------------------------ #
# Per-LC backfill                                                     #
# ------------------------------------------------------------------ #

def _backfill_lc(
    conn,
    client: ExpaClient,
    lc_name: str,
    lc_id: int,
    backfill_start: date,
    backfill_end: date,
    dry_run: bool,
) -> dict[str, int]:
    lc_code = hash_lc_id(lc_id)
    print(f"\n{'═' * 56}")
    print(f"  {lc_name}  →  {lc_code}  (id={lc_id})")
    print(f"{'═' * 56}")

    stats: dict[str, int] = {
        "fetched": 0,
        "cached": 0,
        "failed": 0,
        "rows": 0,
    }

    months = _month_range(backfill_start, backfill_end)
    print(f"  Window: {backfill_start} → {backfill_end}  ({len(months)} months)")

    # ── 1. performance_v3 — one call per month ───────────────────── #
    print(f"\n  [1/2] performance_v3 snapshots:")
    for ms, me in months:
        ms_str, me_str = ms.isoformat(), me.isoformat()
        cached = _load_cache(conn, lc_id, ms_str, "performance_v3")

        if cached is not None:
            data = cached
            tag = "cache"
            stats["cached"] += 1
        elif dry_run:
            print(f"    {ms_str}  [dry-run]")
            continue
        else:
            try:
                data = client.analyze_applications(
                    start_date=ms_str,
                    end_date=me_str,
                    performance_v3={"office_id": lc_id},
                )
                _save_cache(conn, lc_id, ms_str, me_str, "performance_v3", data)
                stats["fetched"] += 1
                tag = "API"
                time.sleep(_INTER_CALL_SLEEP)
            except Exception as exc:
                print(f"    {ms_str}  FAILED: {exc}")
                stats["failed"] += 1
                continue

        funnel = extract_funnel_from_performance_v3(data)
        for stage, count in funnel.items():
            if stage == "sign_up":
                continue
            _upsert_metric(conn, lc_code, lc_id, ms, me, f"funnel.{stage}", count)
            stats["rows"] += 1

        print(
            f"    {ms_str}  applied={funnel.get('applied', 0):>3}"
            f"  approved={funnel.get('approved', 0):>3}  [{tag}]"
        )

    # ── 2. historical — single call for the full window ─────────── #
    print(f"\n  [2/2] historical monthly approved series:")
    hist_key = "historical_approved_monthly"
    hist_start = backfill_start.isoformat()
    hist_end = backfill_end.isoformat()

    cached_hist = _load_cache(conn, lc_id, hist_start, hist_key)

    if cached_hist is not None:
        hist_data = cached_hist
        print(f"    (loaded from cache)")
    elif dry_run:
        print(f"    [dry-run, would fetch {hist_start} → {hist_end}]")
        hist_data = None
    else:
        try:
            hist_data = client.analyze_applications(
                start_date=hist_start,
                end_date=hist_end,
                historical={
                    "office_id": lc_id,
                    "type": "person",
                    "interval": "month",
                    "status": "approved",
                    "projection": False,
                },
            )
            _save_cache(conn, lc_id, hist_start, hist_end, hist_key, hist_data)
            time.sleep(_INTER_CALL_SLEEP)
        except Exception as exc:
            print(f"    historical FAILED: {exc}")
            hist_data = None

    if hist_data:
        buckets = _parse_historical_buckets(hist_data)
        print(f"    {len(buckets)} bucket(s) returned")
        for bucket_date, count in buckets:
            last = monthrange(bucket_date.year, bucket_date.month)[1]
            bucket_end = date(bucket_date.year, bucket_date.month, last)
            _upsert_metric(
                conn, lc_code, lc_id,
                bucket_date, bucket_end,
                "historical.approved", count,
            )
            stats["rows"] += 1

    print(
        f"\n  ✓ fetched={stats['fetched']}  cached={stats['cached']}"
        f"  failed={stats['failed']}  rows={stats['rows']}"
    )
    return stats


# ------------------------------------------------------------------ #
# Entry point                                                         #
# ------------------------------------------------------------------ #

def main() -> None:
    today = date.today()
    # Default backfill start: 2 years back, first of that month
    default_start = date(today.year - 2, today.month, 1)
    # Default backfill end: last completed month
    if today.month == 1:
        default_end = date(today.year - 1, 12, 31)
    else:
        last_day = monthrange(today.year, today.month - 1)[1]
        default_end = date(today.year, today.month - 1, last_day)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--start-date",
        default=default_start.isoformat(),
        help=f"First month to backfill (YYYY-MM-DD, default: {default_start})",
    )
    parser.add_argument(
        "--end-date",
        default=default_end.isoformat(),
        help=f"Last month to backfill (YYYY-MM-DD, default: {default_end})",
    )
    parser.add_argument(
        "--lc-ids",
        default="",
        help="Comma-separated LC IDs to backfill (default: all from peer_lcs.yaml)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without hitting EXPA or writing to DuckDB",
    )
    args = parser.parse_args()

    backfill_start = date.fromisoformat(args.start_date)
    backfill_end = date.fromisoformat(args.end_date)

    # Load LC config
    with open(_CONFIG_PATH) as f:
        config = yaml.safe_load(f)
    all_lcs: dict[str, dict] = config["lcs"]

    # Filter by --lc-ids if provided
    if args.lc_ids:
        requested_ids = {int(x.strip()) for x in args.lc_ids.split(",") if x.strip()}
        lcs_to_run = {k: v for k, v in all_lcs.items() if v["id"] in requested_ids}
        missing = requested_ids - {v["id"] for v in lcs_to_run.values()}
        if missing:
            print(f"WARNING: LC IDs not found in peer_lcs.yaml: {missing}")
    else:
        lcs_to_run = all_lcs

    # Validate EXPA credentials
    settings = get_settings()
    has_creds = settings.expa_access_token or (
        settings.expa_client_id and settings.expa_client_secret
    )
    if not has_creds and not args.dry_run:
        sys.exit(
            "No EXPA credentials found.\n"
            "Set EXPA_ACCESS_TOKEN (or EXPA_CLIENT_ID + EXPA_CLIENT_SECRET) in .env."
        )

    client = ExpaClient.from_env(
        access_token=settings.expa_access_token,
        client_id=settings.expa_client_id,
        client_secret=settings.expa_client_secret,
    )

    print(f"Phase 2 Backfill {'[DRY RUN] ' if args.dry_run else ''}")
    print(f"Window : {backfill_start} → {backfill_end}")
    print(f"LCs    : {', '.join(lcs_to_run.keys())} ({len(lcs_to_run)} total)")

    conn = get_connection()
    totals: dict[str, int] = {"fetched": 0, "cached": 0, "failed": 0, "rows": 0}

    for i, (slug, lc_info) in enumerate(lcs_to_run.items()):
        lc_id: int = lc_info["id"]
        lc_name: str = lc_info["display_name"]

        stats = _backfill_lc(
            conn, client, lc_name, lc_id,
            backfill_start, backfill_end, args.dry_run,
        )
        for k in totals:
            totals[k] += stats[k]

        if not args.dry_run and i < len(lcs_to_run) - 1:
            print(f"\n  (sleeping {_INTER_LC_SLEEP}s before next LC…)")
            time.sleep(_INTER_LC_SLEEP)

    conn.close()

    print(f"\n{'═' * 56}")
    print(f"Backfill complete.")
    print(
        f"Total: fetched={totals['fetched']}  cached={totals['cached']}"
        f"  failed={totals['failed']}  rows={totals['rows']}"
    )
    if totals["failed"] > 0:
        print(
            f"\nWARNING: {totals['failed']} call(s) failed.  "
            "Re-run to retry — successful calls are cached."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
