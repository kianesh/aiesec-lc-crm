#!/usr/bin/env python3
"""
Audit extractMetric correctness against the latest Supabase snapshot.

Steps
-----
1. Pull the most recent Western snapshot from Supabase.
2. Re-run extract_metric (Python port) on each status's raw EXPA sub-payload
   and compare to the stored summary.funnel values.
3. If EXPA credentials are configured, perform a live parity pull for the same
   period and compute the diff between the stored value and the live EXPA call.

Mismatches in step 2 mean the Python extract_metric diverges from the TS
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
    extract_metric,
)

SEPARATOR = "-" * 50


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
    raw_funnel: dict = raw_payload.get("funnel") or {}

    print(f"\nSnapshot  : {snap['id']}")
    print(f"Period    : {snap['period_start']} → {snap['period_end']}")
    print(f"Created   : {snap['created_at']}")
    print(SEPARATOR)

    # ---------------------------------------------------------------- #
    # Step 1: re-run extract_metric on the stored raw sub-payloads      #
    # ---------------------------------------------------------------- #
    print(f"\n{'Stage':<12}  {'stored':>8}  {'recomputed':>10}  {'match?':>7}")
    print(SEPARATOR)

    mismatches: list[tuple[str, int, int]] = []
    for status in FUNNEL_STATUSES:
        stored = stored_funnel.get(status, 0)
        raw_entry = raw_funnel.get(status, {})
        # The stored rawPayload shape: { ok: true, data: <expa_response> }
        if isinstance(raw_entry, dict) and raw_entry.get("ok"):
            expa_data = raw_entry.get("data")
        else:
            expa_data = raw_entry
        recomputed = extract_metric(expa_data)

        ok = stored == recomputed
        if not ok:
            mismatches.append((status, stored, recomputed))
        print(f"{status:<12}  {stored:>8}  {recomputed:>10}  {'OK' if ok else 'MISMATCH':>7}")

    print()
    if mismatches:
        print("MISMATCHES DETECTED — Python extract_metric diverges from stored values:")
        for status, stored, recomputed in mismatches:
            print(f"  {status}: stored={stored}, recomputed={recomputed}")
        print(
            "\nRaw funnel payload for inspection (first 4000 chars):\n"
            + json.dumps(raw_funnel, indent=2, default=str)[:4000]
        )
    else:
        print("All stored values match Python extract_metric recomputation.")

    # ---------------------------------------------------------------- #
    # Step 2: optional live parity pull from EXPA                       #
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
    print("Live EXPA parity pull for the same period…")
    client = ExpaClient.from_env(
        access_token=settings.expa_access_token,
        client_id=settings.expa_client_id,
        client_secret=settings.expa_client_secret,
    )
    period_start = str(snap["period_start"])[:10]
    period_end = str(snap["period_end"])[:10]

    print(f"\n{'Stage':<12}  {'stored':>8}  {'live EXPA':>10}  {'diff':>6}")
    print(SEPARATOR)
    parity_failures = 0
    for status in FUNNEL_STATUSES:
        stored = stored_funnel.get(status, 0)
        try:
            resp = client.analyze_applications(
                start_date=period_start,
                end_date=period_end,
                conversion_v2={
                    "office_id": args.committee_id,
                    "status": status,
                    "type": "person",
                },
            )
            live_val: int | str = extract_metric(resp)
        except Exception as exc:
            live_val = f"ERR: {exc}"
            parity_failures += 1
        diff = (live_val - stored) if isinstance(live_val, int) else "n/a"
        print(f"{status:<12}  {stored:>8}  {str(live_val):>10}  {str(diff):>6}")

    if parity_failures:
        print(f"\n{parity_failures} live pull(s) failed — check EXPA token scope.")
    else:
        print("\nLive parity pull complete.")


if __name__ == "__main__":
    main()
