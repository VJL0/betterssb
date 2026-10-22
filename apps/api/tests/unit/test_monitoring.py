from unittest.mock import Mock

import pytest
import sentry_sdk

from app.core.config import Settings
from app.core.monitoring import (
    ADVISOR_PATH,
    TRACES_SAMPLE_RATE,
    init_sentry,
    sample_traces,
)


def request(path, parent_sampled=None):
    return {"parent_sampled": parent_sampled, "asgi_scope": {"path": path}}


def test_development_never_reports(monkeypatch):
    initialize = Mock()
    monkeypatch.setattr(sentry_sdk, "init", initialize)
    settings = Settings(
        SENTRY_DSN="https://key@o1.ingest.us.sentry.io/1",
        ENVIRONMENT="development",
    )

    init_sentry(settings)

    initialize.assert_not_called()


def test_production_reports_with_the_app_environment(monkeypatch):
    initialize = Mock()
    monkeypatch.setattr(sentry_sdk, "init", initialize)
    settings = Settings(
        SENTRY_DSN="https://key@o1.ingest.us.sentry.io/1",
        ENVIRONMENT="production",
    )

    init_sentry(settings)

    initialize.assert_called_once()
    assert initialize.call_args.kwargs["environment"] == "production"
    assert initialize.call_args.kwargs["dsn"] == settings.SENTRY_DSN


def test_requests_are_sampled():
    assert sample_traces(request("/api/classes/terms")) == TRACES_SAMPLE_RATE


def test_every_advisor_reply_is_traced():
    assert sample_traces(request(ADVISOR_PATH)) == 1.0


@pytest.mark.parametrize("parent_sampled", [True, False])
def test_follows_the_websites_decision(parent_sampled):
    assert sample_traces(request(ADVISOR_PATH, parent_sampled)) == float(parent_sampled)
