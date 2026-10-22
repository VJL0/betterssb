"""Error monitoring, tracing, profiling and logs with Sentry."""

from __future__ import annotations

from typing import Any

import sentry_sdk
from sentry_sdk.integrations.google_genai import GoogleGenAIIntegration
from sentry_sdk.integrations.logging import ignore_logger_for_sentry_logs

from app.core.config import Settings

# Errors are always sent; only this share of traces is, to stay within quota.
TRACES_SAMPLE_RATE = 0.1
# Advisor replies are few and costly, so every one is traced for AI monitoring.
ADVISOR_PATH = "/api/chat"
# Profiles ride along with sampled traces, so this doesn't add requests.
PROFILE_SESSION_SAMPLE_RATE = 1.0


def init_sentry(settings: Settings) -> None:
    """Report unhandled errors, sampled traces and profiles, and logs from
    production. A no-op in development or without a DSN.

    Must run before the FastAPI app is created so its integration hooks in.
    """
    if settings.ENVIRONMENT != "production":
        return
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        release=settings.SENTRY_RELEASE,
        traces_sampler=sample_traces,
        profile_session_sample_rate=PROFILE_SESSION_SAMPLE_RATE,
        profile_lifecycle="trace",
        # stdlib `logging` at INFO and up becomes Sentry Logs.
        enable_logs=True,
        # Requests and stack frames carry students' transcripts, audits and
        # advisor chats, so keep bodies, local variables, prompts and PII out.
        max_request_body_size="never",
        include_local_variables=False,
        # The advisor records one span per reply, whichever provider answers
        # (see app/modules/chatbot/client.py); this would count Gemini twice.
        disabled_integrations=[GoogleGenAIIntegration()],
    )
    ignore_logger_for_sentry_logs("uvicorn.access")


def sample_traces(sampling_context: dict[str, Any]) -> float:
    # Follow the website's decision so distributed traces stay whole.
    parent_sampled = sampling_context.get("parent_sampled")
    if parent_sampled is not None:
        return float(parent_sampled)
    asgi_scope = sampling_context.get("asgi_scope") or {}
    return 1.0 if asgi_scope.get("path") == ADVISOR_PATH else TRACES_SAMPLE_RATE
