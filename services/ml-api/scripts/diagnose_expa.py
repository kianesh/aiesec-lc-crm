"""One-shot EXPA auth/endpoint diagnostic — bypasses the client's 401-refresh.

    python scripts/diagnose_expa.py [--lc-id 1132]

Uses EXPA_ACCESS_TOKEN from .env verbatim (no client_credentials fallback) so we
can see exactly what YOUR token returns. Prints statuses + trimmed bodies; never
prints the token itself.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings


def _trim(obj, n: int = 600) -> str:
    try:
        s = json.dumps(obj, ensure_ascii=False)
    except Exception:
        s = str(obj)
    return s if len(s) <= n else s[:n] + " …(trimmed)"


def _get(url: str, params: list[tuple[str, str]]) -> None:
    try:
        r = httpx.get(url, params=params, timeout=30)
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR: {exc}")
        return
    ct = r.headers.get("content-type", "")
    body = r.json() if ct.startswith("application/json") else r.text
    print(f"  HTTP {r.status_code}")
    # Surface just the useful bits of current_person (name + roles), else trim.
    if isinstance(body, dict) and "positions" in body:
        name = body.get("full_name") or body.get("name")
        positions = [
            {
                "office": (p.get("office") or {}).get("name"),
                "office_id": (p.get("office") or {}).get("id"),
                "role": (p.get("function") or {}).get("name") or p.get("name"),
            }
            for p in (body.get("positions") or [])
        ]
        print(f"  person: {name}")
        print(f"  positions: {_trim(positions)}")
    else:
        print(f"  body: {_trim(body)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lc-id", default="1132")
    args = ap.parse_args()

    tok = get_settings().expa_access_token
    if not tok:
        print("EXPA_ACCESS_TOKEN is EMPTY — set it in .env before running this diagnostic.")
        return
    print(f"Using EXPA_ACCESS_TOKEN from .env (len {len(tok)}); office_id={args.lc_id}\n")
    at = ("access_token", tok)
    perf = ("performance_v3[office_id]", str(args.lc_id))

    print("[ctx] current_person (token has a person?)")
    _get("https://gis-api.aiesec.org/v2/current_person.json", [at])
    print("\n[ctx] committee read (basic scope)")
    _get(f"https://gis-api.aiesec.org/v2/committees/{args.lc_id}", [at])

    # Probe analyze endpoint variants — looking for anything that isn't 404/410/401.
    candidates = [
        ("analytics v2", "https://analytics.api.aiesec.org/v2/applications/analyze"),
        ("analytics v2 .json", "https://analytics.api.aiesec.org/v2/applications/analyze.json"),
        ("analytics v3", "https://analytics.api.aiesec.org/v3/applications/analyze"),
        ("analytics no-ver", "https://analytics.api.aiesec.org/applications/analyze"),
        ("gis v2 .json", "https://gis-api.aiesec.org/v2/applications/analyze.json"),
        ("gis v3", "https://gis-api.aiesec.org/v3/applications/analyze"),
    ]
    print("\n== analyze endpoint probe (performance_v3[office_id]=%s) ==" % args.lc_id)
    for label, url in candidates:
        print(f"\n[{label}] {url}")
        _get(url, [at, perf])

    print("\nRead the statuses:")
    print("  404 = wrong path/version   410 = deprecated   401 forbidden_action = exists, token lacks rights")
    print("  200 / a different error shape = likely the right endpoint")


if __name__ == "__main__":
    main()
