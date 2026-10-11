from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    """Just the database URL, for tools (Alembic) that need nothing else."""

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    model_config = {"env_file": ".env", "extra": "ignore"}


class Settings(DatabaseSettings):
    """Application-wide configuration loaded from environment / .env file."""

    # Auth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    # Required, no default: the app refuses to start with a missing or weak key.
    JWT_SECRET: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # External services
    OPENAI_API_KEY: str = ""
    RMP_AUTH_TOKEN: str = ""

    # Server. Origins are matched exactly; the regex is for local dev, where an
    # unpacked extension's ID isn't known ahead of time.
    CORS_ORIGINS: list[str] = []
    CORS_ORIGIN_REGEX: str | None = None
