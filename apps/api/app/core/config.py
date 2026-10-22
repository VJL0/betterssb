from __future__ import annotations

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings
from sqlalchemy.engine import make_url

ASYNC_POSTGRES_DRIVER = "postgresql+asyncpg"
LIBPQ_POSTGRES_DRIVERS = {"postgres", "postgresql"}


def to_asyncpg_url(url: str) -> str:
    """Adapt a libpq-style Postgres URL, as Neon and its Vercel integration hand
    out, to asyncpg.

    SQLAlchemy passes URL query parameters to `asyncpg.connect()` as keyword
    arguments, and asyncpg takes `ssl` where libpq takes `sslmode` and has no
    `channel_binding`, so Neon's `?sslmode=require&channel_binding=require` would
    raise a TypeError on connect.
    """
    parsed = make_url(url)
    if parsed.drivername not in LIBPQ_POSTGRES_DRIVERS | {ASYNC_POSTGRES_DRIVER}:
        return url
    query = dict(parsed.query)
    if "sslmode" in query:
        query.setdefault("ssl", query.pop("sslmode"))
    query.pop("channel_binding", None)
    return parsed.set(drivername=ASYNC_POSTGRES_DRIVER, query=query).render_as_string(
        hide_password=False
    )


class DatabaseSettings(BaseSettings):
    """Just the database URLs, for tools (Alembic) that need nothing else."""

    # Pooled (Neon's PgBouncer) in production; the app's connection.
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    # Direct connection for migrations and admin work: the pooler runs in
    # transaction mode, which migration tools may not support. Empty falls back to
    # DATABASE_URL, which is already direct locally.
    DATABASE_URL_UNPOOLED: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("DATABASE_URL", "DATABASE_URL_UNPOOLED")
    @classmethod
    def use_asyncpg(cls, url: str) -> str:
        return to_asyncpg_url(url) if url else url

    @property
    def migration_database_url(self) -> str:
        return self.DATABASE_URL_UNPOOLED or self.DATABASE_URL


class Settings(DatabaseSettings):
    """Application-wide configuration loaded from environment / .env file."""

    REDIS_URL: str = "redis://localhost:6379/0"

    # Google sign-in
    GOOGLE_CLIENT_ID: str = Field(min_length=1)
    GOOGLE_CLIENT_SECRET: str = Field(min_length=1)
    # Must exactly match an authorized redirect URI on the Google OAuth client.
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"
    # Where the browser goes after sign-in.
    FRONTEND_URL: str = "http://localhost:3000"

    # Sessions
    # Signs the OAuth handshake cookie.
    SESSION_SECRET: str = Field(min_length=32)

    # External services
    GOOGLE_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # Error monitoring. Empty turns Sentry off (tests, local runs without it).
    SENTRY_DSN: str = ""
    # Vercel sets VERCEL_ENV (production, preview) and the deployed commit.
    SENTRY_ENVIRONMENT: str = Field(
        default="development",
        validation_alias=AliasChoices("SENTRY_ENVIRONMENT", "VERCEL_ENV"),
    )
    SENTRY_RELEASE: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SENTRY_RELEASE", "VERCEL_GIT_COMMIT_SHA"),
    )
