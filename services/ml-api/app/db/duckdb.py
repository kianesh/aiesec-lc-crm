"""Local DuckDB store for anonymized multi-LC benchmark data.

Schema
------
lc_snapshots
    Primary store for long-format metric values per LC per period.
    lc_code is the anonymized identifier (LC_<4-char-sha256>).
    lc_id_raw is retained internally for re-pulls; it is NEVER exposed via API.

lc_raw_cache
    Caches raw EXPA JSON responses keyed by (lc_id_raw, period_start, endpoint_key).
    Backfill re-runs replay from this cache instead of hitting EXPA again.
"""
from pathlib import Path

import duckdb

_DB_PATH = Path(__file__).parent.parent.parent / "data" / "benchmark.duckdb"

_DDL = """
CREATE TABLE IF NOT EXISTS lc_snapshots (
    lc_code      TEXT      NOT NULL,
    lc_id_raw    INTEGER   NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end   TIMESTAMP NOT NULL,
    metric       TEXT      NOT NULL,
    value        DOUBLE    NOT NULL,
    synced_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lc_code, period_start, metric)
);

CREATE TABLE IF NOT EXISTS lc_raw_cache (
    lc_id_raw     INTEGER NOT NULL,
    period_start  TEXT    NOT NULL,
    period_end    TEXT    NOT NULL,
    endpoint_key  TEXT    NOT NULL,
    response_json TEXT    NOT NULL,
    cached_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lc_id_raw, period_start, endpoint_key)
);
"""


def get_connection() -> duckdb.DuckDBPyConnection:
    """Open (or create) benchmark.duckdb and ensure the schema exists."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(_DB_PATH))
    conn.execute(_DDL)
    return conn
