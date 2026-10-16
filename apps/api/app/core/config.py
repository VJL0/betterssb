from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    """Just the database URL, for tools (Alembic) that need nothing else."""

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    model_config = {"env_file": ".env", "extra": "ignore"}


class Settings(DatabaseSettings):
    """Application-wide configuration loaded from environment / .env file."""

    REDIS_URL: str = "redis://localhost:6379/0"

    # Google sign-in
    GOOGLE_CLIENT_ID: str = Field(min_length=1)
    GOOGLE_CLIENT_SECRET: str = Field(min_length=1)
    # Must exactly match an authorized redirect URI on the Google OAuth client.
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"
    # Where the browser goes after sign-in.
    FRONTEND_URL: str = "http://localhost:5173"

    # Sessions
    # Signs the OAuth handshake cookie.
    SESSION_SECRET: str = Field(min_length=32)

    # External services
    OPENAI_API_KEY: str = ""
    RMP_AUTH_TOKEN: str = ""
