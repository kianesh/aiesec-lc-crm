#!/usr/bin/env python3
"""
Probe the EXPA entityTimeline endpoint for per-EP stage records.

The response determines Phase 5 churn prediction strategy:
  - Per-person records WITH stage-transition timestamps → real-data churn model
  - Aggregate counts or no useful per-person data → synthetic data (default)

The script dumps the full raw response and then heuristically classifies what
it found, saving you from reading EXPA API docs that don't exist publicly.

Usage
-----
    cd services/ml-api
    python scripts/probe_entity_timeline.py [--lc-id 1132] [--year 2024] [--month 11] [--status approved]

Output
------
  - Raw JSON response (first 6 000 chars)
  - Structural analysis: is it a list? What keys? Any timestamp-like fields?
  - Verdict: real-data churn feasible or synthetic required
"""
import argparse
import calendar
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.expa.client import ExpaClient

_STATUSES = ("approved", "realized", "completed")
_TIMESTAMP_HINTS = ("date", "time", "_at", "created", "updated", "changed", "moved")
_ID_HINTS = ("id", "person", "ep", "applicant", "member")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lc-id", default="1132", help="EXPA committee ID")
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument("--month", type=int, default=11)
    parser.add_argument("--status", choices=_STATUSES, default="approved")
    parser.add_argument(
        "--all-statuses",
        action="store_true",
        help="Probe all three statuses sequentially",
    )
    args = parser.parse_args()

    settings = get_settings()
    has_creds = settings.expa_access_token or (
        settings.expa_client_id and settings.expa_client_secret
    )
    if not has_creds:
        sys.exit(
            "Set EXPA_ACCESS_TOKEN or EXPA_CLIENT_ID + EXPA_CLIENT_SECRET in .env."
        )

    client = ExpaClient.from_env(
        access_token=settings.expa_access_token,
        client_id=settings.expa_client_id,
        client_secret=settings.expa_client_secret,
    )

    last_day = calendar.monthrange(args.year, args.month)[1]
    start = f"{args.year}-{args.month:02d}-01"
    end = f"{args.year}-{args.month:02d}-{last_day:02d}"

    statuses_to_probe = _STATUSES if args.all_statuses else [args.status]

    verdicts: list[str] = []
    for status in statuses_to_probe:
        print(f"\n{'=' * 60}")
        print(f"entityTimeline — LC {args.lc_id} | {start}→{end} | status={status}")
        print("=" * 60)

        try:
            resp = client.analyze_applications(
                start_date=start,
                end_date=end,
                entity_timeline={
                    "office_id": args.lc_id,
                    "type": "person",
                    "status": status,
                },
            )
        except Exception as exc:
            print(f"ERROR: {exc}")
            verdicts.append(f"{status}: ERROR — {exc}")
            continue

        pretty = json.dumps(resp, indent=2, default=str)
        print(pretty[:6000])
        if len(pretty) > 6000:
            print(f"\n… (truncated — full response is {len(pretty):,} chars)")

        verdict = _analyze(resp, status)
        verdicts.append(verdict)

    print(f"\n{'=' * 60}")
    print("VERDICTS")
    print("=" * 60)
    for v in verdicts:
        print(f"  {v}")
    print()
    if any("real-data" in v for v in verdicts):
        print(
            "At least one status returned per-EP records. "
            "Phase 5 can use REAL data — update Phase 5 notes accordingly."
        )
    else:
        print(
            "No per-EP stage-transition records found. "
            "Phase 5 will use SYNTHETIC data calibrated to real funnel ratios."
        )


def _analyze(resp: object, status: str) -> str:
    """Heuristically classify the response and return a one-line verdict."""
    if not isinstance(resp, (dict, list)):
        return f"{status}: unexpected type {type(resp).__name__} — inspect manually"

    if isinstance(resp, list):
        n = len(resp)
        if n == 0:
            return f"{status}: empty list — no records for this period"
        sample = resp[0]
        ts_keys = _timestamp_keys(sample)
        id_keys = _id_like_keys(sample)
        if ts_keys:
            return (
                f"{status}: list of {n} records WITH timestamp keys {ts_keys} "
                f"— real-data churn FEASIBLE"
            )
        return (
            f"{status}: list of {n} records but NO timestamp keys "
            f"(id-like: {id_keys}) — inspect further before deciding"
        )

    # dict
    keys = list(resp.keys())
    for key, value in resp.items():
        if isinstance(value, list) and value:
            sample = value[0]
            ts_keys = _timestamp_keys(sample)
            id_keys = _id_like_keys(sample)
            n = len(value)
            if ts_keys:
                return (
                    f"{status}: dict['{key}'] → list of {n} records WITH "
                    f"timestamp keys {ts_keys} — real-data churn FEASIBLE"
                )
            return (
                f"{status}: dict['{key}'] → list of {n} records, "
                f"no timestamp keys (id-like: {id_keys}) — inspect further"
            )
    return (
        f"{status}: dict with keys {keys} — no list-valued sub-keys found; "
        "likely an aggregate, not per-EP records"
    )


def _timestamp_keys(record: object) -> list[str]:
    if not isinstance(record, dict):
        return []
    return [k for k in record if any(h in k.lower() for h in _TIMESTAMP_HINTS)]


def _id_like_keys(record: object) -> list[str]:
    if not isinstance(record, dict):
        return []
    return [k for k in record if any(h in k.lower() for h in _ID_HINTS)]


if __name__ == "__main__":
    main()
