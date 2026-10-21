from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.api.deps import SettingsDep
from app.modules.chatbot.schemas import ChatRequest
from app.modules.chatbot.service import ChatbotService

router = APIRouter(prefix="/chat", tags=["chat"])


def stream_service(body: ChatRequest, settings: SettingsDep) -> ChatbotService:
    # Validate the request before checking availability or opening a provider client.
    if not settings.GOOGLE_API_KEY:
        raise HTTPException(
            status_code=503, detail="The chat assistant is unavailable."
        )
    return ChatbotService(
        google_api_key=settings.GOOGLE_API_KEY,
        groq_api_key=settings.GROQ_API_KEY,
        preferred_provider=body.provider,
        effort=body.effort,
    )


def stream_headers(response: Response) -> None:
    response.headers["x-vercel-ai-ui-message-stream"] = "v1"


@router.post(
    "",
    response_class=EventSourceResponse,
    dependencies=[Depends(stream_headers)],
    responses={200: {"description": "AI SDK UI message stream (v1)"}},
)
async def chat(
    body: ChatRequest,
    service: Annotated[ChatbotService, Depends(stream_service)],
) -> AsyncIterator[ServerSentEvent]:
    message_id = str(uuid4())
    text_id = str(uuid4())
    yield ServerSentEvent(data={"type": "start", "messageId": message_id})
    yield ServerSentEvent(data={"type": "text-start", "id": text_id})
    try:
        async with aclosing(
            service.stream([m.model_dump() for m in body.messages], body.context)
        ) as stream:
            async for text in stream:
                yield ServerSentEvent(
                    data={"type": "text-delta", "id": text_id, "delta": text}
                )
        yield ServerSentEvent(data={"type": "text-end", "id": text_id})
        yield ServerSentEvent(
            data={
                "type": "finish",
                "finishReason": "stop",
                "messageMetadata": {"provider": service.provider},
            }
        )
    except Exception:
        logging.getLogger(__name__).exception("Advisor stream failed")
        yield ServerSentEvent(
            data={
                "type": "error",
                "errorText": "The advisor could not finish this reply. Please try again.",
            }
        )
    yield ServerSentEvent(raw_data="[DONE]")
