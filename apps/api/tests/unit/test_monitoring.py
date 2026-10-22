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


def test_development_never_reports():
    settings = Settings(
        SENTRY_DSN="https://key@o1.ingest.us.sentry.io/1",
        SENTRY_ENVIRONMENT="development",
    )

    init_sentry(settings)

    assert not sentry_sdk.get_client().is_active()


def test_requests_are_sampled():
    assert sample_traces(request("/api/classes/terms")) == TRACES_SAMPLE_RATE


def test_every_advisor_reply_is_traced():
    assert sample_traces(request(ADVISOR_PATH)) == 1.0


@pytest.mark.parametrize("parent_sampled", [True, False])
def test_follows_the_websites_decision(parent_sampled):
    assert sample_traces(request(ADVISOR_PATH, parent_sampled)) == float(parent_sampled)
