import pytest

from app.core.monitoring import (
    ADVISOR_PATH,
    DEPLOYED_TRACES_SAMPLE_RATE,
    _traces_sampler,
)


def request(path, parent_sampled=None):
    return {"parent_sampled": parent_sampled, "asgi_scope": {"path": path}}


def test_deployed_requests_are_sampled():
    sample = _traces_sampler("production")
    assert sample(request("/api/classes/terms")) == DEPLOYED_TRACES_SAMPLE_RATE


def test_development_traces_everything():
    assert _traces_sampler("development")(request("/api/classes/terms")) == 1.0


def test_every_advisor_reply_is_traced():
    assert _traces_sampler("production")(request(ADVISOR_PATH)) == 1.0


@pytest.mark.parametrize("parent_sampled", [True, False])
def test_follows_the_websites_decision(parent_sampled):
    sample = _traces_sampler("production")
    assert sample(request(ADVISOR_PATH, parent_sampled)) == float(parent_sampled)
