"""Error monitoring and tracing with Sentry."""

from __future__ import annotations

import sentry_sdk

from app.core.config import Settings

DEVELOPMENT_ENVIRONMENT = "development"
# Errors are always sent; only this share of traces is, to stay within quota.
DEPLOYED_TRACES_SAMPLE_RATE = 0.1


def init_sentry(settings: Settings) -> None:
    """Report unhandled errors and sampled traces. A no-op without a DSN.

    Must run before the FastAPI app is created so its integration hooks in.
    """
    is_development = settings.SENTRY_ENVIRONMENT == DEVELOPMENT_ENVIRONMENT
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=settings.SENTRY_RELEASE,
        traces_sample_rate=1.0 if is_development else DEPLOYED_TRACES_SAMPLE_RATE,
        # Requests and stack frames carry students' transcripts, audits and
        # advisor chats, so keep bodies, local variables and PII out of events.
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
    )
