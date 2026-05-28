from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase Postgres — read-only in this service
    database_url: str = ""

    # Bearer token that Next.js sends to this service
    ml_api_key: str = "dev-key-change-in-production"

    # EXPA OAuth — provide either access_token OR the client-creds pair
    expa_client_id: str = ""
    expa_client_secret: str = ""
    expa_access_token: str = ""  # takes priority over client-creds when set

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
