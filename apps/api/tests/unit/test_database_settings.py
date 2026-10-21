from __future__ import annotations

import pytest

from app.core.config import DatabaseSettings, to_asyncpg_url

NEON_HOST = "ep-cool-darkness-123456.us-east-2.aws.neon.tech"


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch: pytest.MonkeyPatch):
    # The suite's conftest sets DATABASE_URL; these tests set their own.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL_UNPOOLED", raising=False)


def settings(**env: str) -> DatabaseSettings:
    return DatabaseSettings(_env_file=None, **env)


class TestToAsyncpgUrl:
    def test_converts_a_neon_connection_string(self):
        url = to_asyncpg_url(
            f"postgresql://alex:AbC123dEf@{NEON_HOST}/dbname"
            "?sslmode=require&channel_binding=require"
        )

        assert (
            url == f"postgresql+asyncpg://alex:AbC123dEf@{NEON_HOST}/dbname?ssl=require"
        )

    def test_accepts_the_postgres_scheme(self):
        assert to_asyncpg_url("postgres://u:p@host/db").startswith(
            "postgresql+asyncpg://"
        )

    def test_keeps_an_explicit_ssl_over_sslmode(self):
        url = to_asyncpg_url("postgresql://u:p@host/db?ssl=verify-full&sslmode=require")

        assert url == "postgresql+asyncpg://u:p@host/db?ssl=verify-full"

    def test_keeps_the_password_percent_encoded(self):
        url = to_asyncpg_url("postgresql://u:p%40ss@host/db")

        assert url == "postgresql+asyncpg://u:p%40ss@host/db"

    def test_leaves_other_databases_alone(self):
        assert to_asyncpg_url("sqlite+aiosqlite:///") == "sqlite+aiosqlite:///"


class TestMigrationDatabaseUrl:
    def test_uses_the_unpooled_url(self):
        config = settings(
            DATABASE_URL=f"postgresql://u:p@{NEON_HOST.replace('.', '-pooler.', 1)}/db",
            DATABASE_URL_UNPOOLED=f"postgresql://u:p@{NEON_HOST}/db",
        )

        assert config.migration_database_url == (
            f"postgresql+asyncpg://u:p@{NEON_HOST}/db"
        )

    def test_falls_back_to_database_url(self):
        config = settings(DATABASE_URL="postgresql+asyncpg://u:p@localhost/db")

        assert config.migration_database_url == "postgresql+asyncpg://u:p@localhost/db"
