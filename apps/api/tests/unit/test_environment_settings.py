import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)


def test_defaults_to_development():
    assert Settings(_env_file=None).ENVIRONMENT == "development"


@pytest.mark.parametrize("environment", ["production", "development"])
def test_accepts_supported_environments(environment, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", environment)

    assert Settings(_env_file=None).ENVIRONMENT == environment


def test_uses_vercel_environment_when_not_explicit(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")

    assert Settings(_env_file=None).ENVIRONMENT == "production"


def test_explicit_environment_takes_precedence(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("VERCEL_ENV", "production")

    assert Settings(_env_file=None).ENVIRONMENT == "development"


@pytest.mark.parametrize("variable", ["ENVIRONMENT", "VERCEL_ENV"])
def test_rejects_unsupported_environments(variable, monkeypatch):
    monkeypatch.setenv(variable, "unsupported")

    with pytest.raises(ValidationError, match="production.*development"):
        Settings(_env_file=None)
