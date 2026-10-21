from __future__ import annotations

from collections.abc import AsyncIterator
from http import HTTPStatus

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
            if not has_text or response.finish_reason != "stop":
                raise ValueError("Generation did not complete")
            self.provider = "groq" if response.provider_name == "groq" else "gemini"
