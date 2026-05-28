"""Read-only SQLAlchemy connection to Supabase Postgres.

The ML service never writes to Supabase — it only reads expa_analytics_snapshots
for the active LC's own data. Multi-LC data lives in DuckDB (see duckdb.py).
"""
from functools import lru_cache
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.config import get_settings


@lru_cache
def _engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and fill it in."
        )
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=0)


def fetch_snapshots_for_lc(
    committee_id: str | int,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return expa_analytics_snapshots for a given EXPA committee ID, newest-first.

    Filters by summary->>'committeeId' (the EXPA numeric ID stored in the JSONB
    summary column) rather than the internal Supabase lc_id UUID, so the caller
    only needs the EXPA committee ID.
    """
    with _engine().connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT
                    id,
                    lc_id,
                    period_start,
                    period_end,
                    summary,
                    raw_payload,
                    created_at
                FROM expa_analytics_snapshots
                WHERE summary->>'committeeId' = :cid
                ORDER BY period_start DESC
                LIMIT :lim
                """
            ),
            {"cid": str(committee_id), "lim": limit},
        ).mappings().all()
    return [dict(r) for r in rows]
