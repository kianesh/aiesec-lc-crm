# ML Service — Deploy & Demo

The `services/ml-api` FastAPI service powers the dashboard's **AI Insights**
widget (demand forecast, anomaly detection, peer benchmarking, funnel drop-off
risk). Its four endpoints read only from a local DuckDB store, so a deployed
instance needs **no live EXPA token and no Supabase at request time** — it ships
with seeded demo data and serves immediately behind an API key.

## What runs where

- **ml-api** → Railway (Docker). Serves `/forecast-demand`, `/anomalies`,
  `/peer-benchmark`, `/churn-risk`, plus interactive docs at `/docs`.
- **CRM** (Vercel) calls it via the server-side `/api/ml/insights` route using
  `ML_API_URL` + `ML_API_KEY`; the dashboard widget renders the result.

## Deploy the ml-api to Railway

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
2. Set the service **Root Directory** to `services/ml-api` (Railway reads
   `railway.toml` + `Dockerfile`).
3. Add one variable: **`ML_API_KEY`** = a real secret (this is the Bearer token
   the CRM will send). `DATABASE_URL` / `EXPA_*` are **not** needed for the
   demo — only for a real backfill.
4. Deploy. The start command seeds demo data if the store is empty, then serves.
   Health check is `GET /health`.
5. Copy the public URL (e.g. `https://ml-api-xxxx.up.railway.app`). Verify:
   - `https://<url>/health` → `{"status":"ok",...}`
   - `https://<url>/docs` → Swagger UI

## Wire the CRM (Vercel)

Set in Vercel Project → Settings → Environment Variables (then redeploy):

```
ML_API_URL=https://ml-api-xxxx.up.railway.app
ML_API_KEY=<the same secret as on Railway>
```

The dashboard **AI Insights** widget now shows live forecasts/anomalies/
benchmarks. Until these are set it shows a graceful "connect the ML service"
message — nothing breaks.

## Demo data vs. real data

- **Demo (default):** `python -m app.training.seed_demo --if-empty` runs on boot
  and seeds synthetic multi-LC funnel data with realistic university-cycle
  seasonality, one injected anomaly, and a deliberate approved→realized drop-off.
  This is what makes the endpoints return rich results out of the box.
- **Real data (optional, later):** attach a Railway **volume** mounted at
  `/app/data`, then run the backfill against it with a valid EXPA **user** token
  (see `docs/auth-and-expa-setup.md` — analytics needs a user token, not
  client_credentials):
  ```
  python scripts/smoke_test_peer_pull.py --lc-id 1132
  python -m app.training.backfill_peer_lcs
  ```
  Because the boot seed uses `--if-empty`, real data in the volume is never
  overwritten.

## Local dev

```
cd services/ml-api && source .venv/bin/activate
python -m app.training.seed_demo          # populate demo data locally
uvicorn app.main:app --reload --port 8000 # /docs
```
Then in `apps/web/.env.local`: `ML_API_URL=http://localhost:8000` and
`ML_API_KEY=<match>`.
