from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.deps import SettingsDep
from app.modules.chatbot.schemas import ChatRequest, ChatResponse
from app.modules.chatbot.service import ChatbotService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(body: ChatRequest, settings: SettingsDep) -> ChatResponse:
    """Send a conversation to the academic advising chatbot."""
    if not settings.OPENAI_API_KEY:
        # Don't reveal configuration details (RFC 9457 §5).
        raise HTTPException(
            status_code=503, detail="The chat assistant is unavailable."
        )

    service = ChatbotService(api_key=settings.OPENAI_API_KEY)
    reply = await service.chat(messages=body.messages, context=body.context)
    return ChatResponse(response=reply)
