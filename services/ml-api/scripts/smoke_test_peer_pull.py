#!/usr/bin/env python3
"""
Smoke test: confirm the EB-level EXPA token works for an arbitrary peer LC.

Run this for EVERY peer LC in peer_lcs.yaml before starting the Phase 2
backfill.  A failure here means the token does not have cross-LC analytics
scope for that LC — do not proceed to backfill.

Exit codes
----------
0  All test calls succeeded
1  One or more calls failed

Usage
-----
    cd services/ml-api
    python scripts/smoke_test_peer_pull.py --lc-id 864
    python scripts/smoke_test_peer_pull.py --lc-id 864 --start-date 2024-10-01 --end-date 2024-10-31
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.expa.client import ExpaClient, extract_metric, hash_lc_id

_TEST_STATUSES = ("sign_up", "applied", "approved")
_DEFAULT_START = "2024-10-01"
_DEFAULT_END = "2024-10-31"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lc-id", required=True, help="Peer LC EXPA committee ID")
    parser.add_argument("--start-date", default=_DEFAULT_START)
    parser.add_argument("--end-date", default=_DEFAULT_END)
    args = parser.parse_args()

    settings = get_settings()
    has_creds = settings.expa_access_token or (
        settings.expa_client_id and settings.expa_client_secret
    )
    if not has_creds:
        sys.exit(
            "No EXPA credentials found.\n"
            "Set EXPA_ACCESS_TOKEN (or EXPA_CLIENT_ID + EXPA_CLIENT_SECRET) in .env."
        )

    client = ExpaClient.from_env(
        access_token=settings.expa_access_token,
        client_id=settings.expa_client_id,
        client_secret=settings.expa_client_secret,
    )

    lc_code = hash_lc_id(args.lc_id)
    print(f"Smoke testing LC {args.lc_id} ({lc_code})")
    print(f"Period: {args.start_date} → {args.end_date}\n")

    passed = 0
    failed = 0

    # Test 1: conversion_v2 calls for 3 funnel stages
    print("conversion_v2 calls:")
    for status in _TEST_STATUSES:
        try:
            resp = client.analyze_applications(
                start_date=args.start_date,
                end_date=args.end_date,
                conversion_v2={
                    "office_id": args.lc_id,
                    "status": status,
                    "type": "person",
                },
            )
            val = extract_metric(resp)
            print(f"  {status:<12} → {val:>6}  OK")
            passed += 1
        except Exception as exc:
            print(f"  {status:<12} → FAILED: {exc}")
            failed += 1

    # Test 2: basic (home office) call
    print("\nbasic call (home_office_id):")
    try:
        resp = client.analyze_applications(
            start_date=args.start_date,
            end_date=args.end_date,
            basic={"home_office_id": args.lc_id, "type": "person"},
        )
        val = extract_metric(resp)
        print(f"  basic              → {val:>6}  OK")
        passed += 1
    except Exception as exc:
        print(f"  basic              → FAILED: {exc}")
        failed += 1

    # Test 3: historical monthly time series
    print("\nhistorical (monthly) call:")
    try:
        resp = client.analyze_applications(
            start_date=args.start_date,
            end_date=args.end_date,
            historical={
                "office_id": args.lc_id,
                "type": "person",
                "interval": "month",
                "status": "approved",
                "projection": False,
            },
        )
        val = extract_metric(resp)
        print(f"  historical         → {val:>6}  OK")
        passed += 1
    except Exception as exc:
        print(f"  historical         → FAILED: {exc}")
        failed += 1

    print(f"\n{'─' * 40}")
    print(f"Results: {passed} passed, {failed} failed")

    if failed == 0:
        print("\nSmoke test PASSED — EB token has cross-LC analytics access for this LC.")
        sys.exit(0)
    else:
        print(
            "\nSmoke test FAILED — do not run the Phase 2 backfill until this passes."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
