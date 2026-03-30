from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_settings
from app.core.config import Settings
from app.domains.chatbot.schemas import ChatRequest, ChatResponse
from app.domains.chatbot.service import ChatbotService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    """Send a conversation to the academic advising chatbot."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    service = ChatbotService(api_key=settings.OPENAI_API_KEY)
    reply = await service.chat(messages=body.messages, context=body.context)
    return ChatResponse(response=reply)
