#!/usr/bin/env python3
"""
Audit extractMetric correctness against the latest Supabase snapshot.

Steps
-----
1. Pull the most recent Western snapshot from Supabase.
2. Re-run extract_funnel_from_performance_v3 (Python port) on the stored
   raw_payload.performanceV3 sub-payload and compare to summary.funnel.
3. If EXPA credentials are configured, perform a live performance_v3 pull
   for the same period and compute the diff.

Mismatches in step 2 mean the Python funnel extraction diverges from the TS
version — fix before training.  Mismatches in step 3 mean the snapshot was
computed incorrectly at sync time.

Usage
-----
    cd services/ml-api
    python scripts/audit_snapshot.py [--committee-id 1132]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.db.supabase import fetch_snapshots_for_lc
from app.expa.client import (
    FUNNEL_STATUSES,
    ExpaClient,
    extract_funnel_from_performance_v3,
)

SEPARATOR = "-" * 50


def _extract_perf_applicants(metric: dict) -> int:
    """Mirror TS extractPerformanceApplicants: applicants.value ?? doc_count ?? 0."""
    if not isinstance(metric, dict):
        return 0
    value = (metric.get("applicants") or {}).get("value")
    if value is None:
        value = metric.get("doc_count")
    return int(value) if isinstance(value, (int, float)) else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--committee-id", default="1132", help="EXPA committee ID")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.database_url:
        sys.exit(
            "DATABASE_URL is not set.\n"
            "Copy .env.example to .env and fill in the Supabase connection string."
        )

    print(f"Fetching latest snapshot for committee {args.committee_id} from Supabase…")
    snapshots = fetch_snapshots_for_lc(args.committee_id, limit=1)

    if not snapshots:
        print(
            "\nNo snapshots found for committee ID %s.\n"
            "Run a manual sync from the web app first:\n"
            "  Dashboard → EXPA → Sync EXPA" % args.committee_id
        )
        return

    snap = snapshots[0]
    stored_funnel: dict = (snap["summary"] or {}).get("funnel", {})
    raw_payload: dict = snap["raw_payload"] or {}

    print(f"\nSnapshot  : {snap['id']}")
    print(f"Period    : {snap['period_start']} → {snap['period_end']}")
    print(f"Created   : {snap['created_at']}")
    print(SEPARATOR)

    # ---------------------------------------------------------------- #
    # Step 1: re-extract funnel from stored raw_payload.performanceV3  #
    # ---------------------------------------------------------------- #
    perf_v3_entry: dict = raw_payload.get("performanceV3") or {}
    if not isinstance(perf_v3_entry, dict) or not perf_v3_entry.get("ok"):
        print("\nWARNING: raw_payload.performanceV3 is missing or marked not-ok.")
        print("  Raw keys present:", list(raw_payload.keys()))
        print("  Skipping recomputation step.")
        perf_v3_response = None
    else:
        perf_v3_response = perf_v3_entry.get("data")

    if perf_v3_response is not None:
        recomputed_funnel = extract_funnel_from_performance_v3(perf_v3_response)

        print(f"\n{'Stage':<12}  {'stored':>8}  {'recomputed':>10}  {'match?':>7}")
        print(SEPARATOR)

        mismatches: list[tuple[str, int, int]] = []
        for status in FUNNEL_STATUSES:
            stored = stored_funnel.get(status, 0)
            recomputed = recomputed_funnel.get(status, 0)
            ok = stored == recomputed
            if not ok:
                mismatches.append((status, stored, recomputed))
            print(f"{status:<12}  {stored:>8}  {recomputed:>10}  {'OK' if ok else 'MISMATCH':>7}")

        print()
        if mismatches:
            print("MISMATCHES DETECTED — Python funnel extraction diverges from stored values:")
            for status, stored, recomputed in mismatches:
                print(f"  {status}: stored={stored}, recomputed={recomputed}")
            print(
                "\nRaw performanceV3 response for inspection (first 4000 chars):\n"
                + json.dumps(perf_v3_response, indent=2, default=str)[:4000]
            )
        else:
            print("All stored values match Python funnel recomputation.")

    # ---------------------------------------------------------------- #
    # Step 2: optional live parity pull from EXPA (performance_v3)     #
    # ---------------------------------------------------------------- #
    has_creds = settings.expa_access_token or (
        settings.expa_client_id and settings.expa_client_secret
    )
    if not has_creds:
        print(
            "\nSkipping live EXPA parity pull — "
            "no EXPA credentials in .env (EXPA_ACCESS_TOKEN or EXPA_CLIENT_ID+SECRET)."
        )
        return

    print(f"\n{SEPARATOR}")
    print("Live EXPA performance_v3 parity pull for the same period…")
    client = ExpaClient.from_env(
        access_token=settings.expa_access_token,
        client_id=settings.expa_client_id,
        client_secret=settings.expa_client_secret,
    )
    period_start = str(snap["period_start"])[:10]
    period_end = str(snap["period_end"])[:10]

    try:
        live_resp = client.analyze_applications(
            start_date=period_start,
            end_date=period_end,
            performance_v3={"office_id": args.committee_id},
        )
        live_funnel = extract_funnel_from_performance_v3(live_resp)
        live_ok = True
    except Exception as exc:
        print(f"\nLive pull FAILED: {exc}")
        live_ok = False
        live_funnel = {}

    if live_ok:
        print(f"\n{'Stage':<12}  {'stored':>8}  {'live EXPA':>10}  {'diff':>6}")
        print(SEPARATOR)
        for status in FUNNEL_STATUSES:
            stored = stored_funnel.get(status, 0)
            live_val = live_funnel.get(status, 0)
            diff = live_val - stored
            print(f"{status:<12}  {stored:>8}  {live_val:>10}  {diff:>+6}")
        print("\nLive parity pull complete.")


if __name__ == "__main__":
    main()
