from __future__ import annotations

from collections.abc import AsyncIterator
from http import HTTPStatus

import sentry_sdk
from httpx import AsyncClient
from pydantic_ai.direct import model_request_stream
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    SystemPromptPart,
    TextPart,
    TextPartDelta,
    UserPromptPart,
)
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.models.groq import GroqModel, GroqModelSettings
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.groq import GroqProvider
from sentry_sdk.consts import OP, SPANDATA
from sentry_sdk.tracing import Span

from app.modules.chatbot.schemas import ChatProvider, ThinkingEffort

SERVER_ERROR_MAX = 599
PRIMARY_MODEL = "gemini-3.8-flash"
FALLBACK_MODEL = "qwen/qwen3.8-27b"
ADVISOR_TIMEOUT_SECONDS = 60


def should_fallback(error: Exception) -> bool:
    return isinstance(error, ModelHTTPError) and (
        error.status_code in {HTTPStatus.NOT_FOUND, HTTPStatus.TOO_MANY_REQUESTS}
        or HTTPStatus.INTERNAL_SERVER_ERROR <= error.status_code <= SERVER_ERROR_MAX
    )


def advisor_model(
    google_api_key: str,
    groq_api_key: str,
    http_client: AsyncClient,
    *,
    preferred_provider: ChatProvider = "gemini",
    effort: ThinkingEffort = "low",
) -> Model:
    primary = GoogleModel(
        PRIMARY_MODEL,
        provider=GoogleProvider(api_key=google_api_key, http_client=http_client),
        settings=GoogleModelSettings(google_thinking_config={"thinking_level": effort}),
    )
    if not groq_api_key:
        return primary
    fallback = GroqModel(
        FALLBACK_MODEL,
        provider=GroqProvider(api_key=groq_api_key, http_client=http_client),
        settings=GroqModelSettings(
            groq_reasoning_effort=effort, groq_reasoning_format="hidden"
        ),
    )
    models = (
        (fallback, primary) if preferred_provider == "groq" else (primary, fallback)
    )
    return FallbackModel(*models, fallback_on=should_fallback)


def record_reply(span: Span, response: ModelResponse) -> None:
    """Name the model that answered and its token usage on the reply's AI span.
    Prompts and replies stay out: they carry students' records.
    """
    usage = response.usage
    span.description = f"chat {response.model_name}"
    span.set_data(SPANDATA.GEN_AI_RESPONSE_MODEL, response.model_name)
    span.set_data(SPANDATA.GEN_AI_PROVIDER_NAME, response.provider_name)
    span.set_data(SPANDATA.GEN_AI_USAGE_INPUT_TOKENS, usage.input_tokens)
    span.set_data(SPANDATA.GEN_AI_USAGE_INPUT_TOKENS_CACHED, usage.cache_read_tokens)
    span.set_data(SPANDATA.GEN_AI_USAGE_OUTPUT_TOKENS, usage.output_tokens)
    span.set_data(
        SPANDATA.GEN_AI_USAGE_OUTPUT_TOKENS_REASONING, usage.output_reasoning_tokens
    )
    span.set_data(SPANDATA.GEN_AI_USAGE_TOTAL_TOKENS, usage.total_tokens)


def conversation_messages(
    messages: list[dict], system_instruction: str
) -> list[ModelMessage]:
    history: list[ModelMessage] = [
        ModelRequest(parts=[SystemPromptPart(system_instruction)])
    ]
    for message in messages:
        if message["role"] == "user":
            history.append(ModelRequest(parts=[UserPromptPart(message["content"])]))
        else:
            history.append(ModelResponse(parts=[TextPart(message["content"])]))
    return history


class AdvisorClient:
    def __init__(
        self,
        google_api_key: str,
        groq_api_key: str = "",
        *,
        preferred_provider: ChatProvider = "gemini",
        effort: ThinkingEffort = "low",
    ) -> None:
        self._google_api_key = google_api_key
        self._groq_api_key = groq_api_key
        self._preferred_provider = preferred_provider
        self._effort = effort
        self.provider: ChatProvider | None = None

    async def stream_completion(
        self, messages: list[dict], *, system_instruction: str
    ) -> AsyncIterator[str]:
        history = conversation_messages(messages, system_instruction)
        requested_model = (
            FALLBACK_MODEL if self._preferred_provider == "groq" else PRIMARY_MODEL
        )
        with sentry_sdk.start_span(
            op=OP.GEN_AI_CHAT, name=f"chat {requested_model}"
        ) as span:
            span.set_data(SPANDATA.GEN_AI_OPERATION_NAME, "chat")
            span.set_data(SPANDATA.GEN_AI_REQUEST_MODEL, requested_model)
            span.set_data(SPANDATA.GEN_AI_REQUEST_REASONING_LEVEL, self._effort)
            span.set_data(SPANDATA.GEN_AI_RESPONSE_STREAMING, True)
            # Google derives its server deadline from this timeout; the default 5s is rejected.
            async with AsyncClient(timeout=ADVISOR_TIMEOUT_SECONDS) as http_client:
                model = advisor_model(
                    self._google_api_key,
                    self._groq_api_key,
                    http_client,
                    preferred_provider=self._preferred_provider,
                    effort=self._effort,
                )
                async with model_request_stream(model, history) as stream:
                    has_text = False
                    async for event in stream:
                        text = ""
                        if isinstance(event, PartStartEvent) and isinstance(
                            event.part, TextPart
                        ):
                            text = event.part.content
                        elif isinstance(event, PartDeltaEvent) and isinstance(
                            event.delta, TextPartDelta
                        ):
                            text = event.delta.content_delta
                        if text:
                            has_text = True
                            yield text
                response = stream.get()
                record_reply(span, response)
                if not has_text or response.finish_reason != "stop":
                    raise ValueError("Generation did not complete")
                self.provider = "groq" if response.provider_name == "groq" else "gemini"
