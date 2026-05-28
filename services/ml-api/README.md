# AIESEC ML API

FastAPI service providing demand forecasting, anomaly detection, and peer
benchmarking for AIESEC Local Committees.

> **Portfolio context** — Built as a production-style ML service demonstrating
> time-series demand forecasting (SARIMAX with hierarchical cohort exogenous
> variables), anomaly detection (Isolation Forest), ML lifecycle management
> (MLflow), and customer-facing KPI reporting.  Deployed on Railway via Docker.

---

## Quick start

```bash
cd services/ml-api
cp .env.example .env        # fill in DATABASE_URL, ML_API_KEY, EXPA_* vars
pip install -r requirements.txt
just dev                    # uvicorn --reload on :8000
open http://localhost:8000/docs
```

---

## Phase 0 diagnostic scripts

Run these **before** the Phase 2 backfill and again whenever you get new data.

```bash
# 1. Audit that Python extract_metric matches stored Supabase funnel values
just audit-snapshot

# 2. Confirm the EB-level EXPA token works for each peer LC (run once per LC)
just smoke-test-peer lc_id=864    # Toronto
just smoke-test-peer lc_id=1000   # TMU
just smoke-test-peer lc_id=1075   # UBC
just smoke-test-peer lc_id=1135   # SFU
just smoke-test-peer lc_id=1196   # Manitoba
just smoke-test-peer lc_id=829    # Edmonton
just smoke-test-peer lc_id=1319   # Laval

# 3. Probe entityTimeline — determines real vs synthetic churn (Phase 5)
just probe-entity-timeline lc_id=1132
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres read-only connection |
| `ML_API_KEY` | Yes | Bearer token sent by the Next.js app |
| `EXPA_CLIENT_ID` | Yes\* | EXPA OAuth client ID |
| `EXPA_CLIENT_SECRET` | Yes\* | EXPA OAuth client secret |
| `EXPA_ACCESS_TOKEN` | No | Pre-fetched token (overrides client creds) |

\* Required for EXPA data pulls.  Set either `EXPA_ACCESS_TOKEN` or the
client-credentials pair.

---

## Docker

```bash
just docker-build
just docker-run          # listens on :8000, reads from .env
```

---

## Service layout

```
app/
  main.py              FastAPI app + /health endpoint
  auth.py              Bearer token dependency (require_api_key)
  config.py            Pydantic settings (reads .env)
  config/
    peer_lcs.yaml      Canadian peer LC committee IDs
  db/
    supabase.py        Read-only queries against expa_analytics_snapshots
    duckdb.py          Anonymized multi-LC local store (data/benchmark.duckdb)
  expa/
    client.py          Python EXPA GIS client + extract_metric + hash_lc_id
  models/              ML model classes (Phases 3–5)
  schemas/             Pydantic response schemas
  training/            Training scripts (Phases 2–5)
scripts/
  audit_snapshot.py         Phase 0 — extractMetric correctness audit
  smoke_test_peer_pull.py   Phase 0 — cross-LC token scope check
  probe_entity_timeline.py  Phase 0 — per-EP record availability probe
data/                  gitignored — benchmark.duckdb lives here
mlruns/                gitignored — MLflow tracking
artifacts/             gitignored — serialised models (.pkl)
```

---

## Privacy and data handling

- Multi-LC raw data is **never** written to Supabase.  It lives only in
  `data/benchmark.duckdb` (gitignored, local to this service).
- All cross-LC API responses use opaque hashed IDs (`LC_<4-char-sha256>`).
  The requesting LC's name is returned in cleartext; all peers are anonymised.
- `data/`, `mlruns/`, and `artifacts/` are in `.gitignore`.  The committed
  `data/.gitkeep` is the only file in that directory tracked by git.
