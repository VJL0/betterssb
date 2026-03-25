from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import Settings
from app.core.deps import get_settings
from app.services.chatbot_service import ChatbotService

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict]
    context: str = ""


class ChatResponse(BaseModel):
    response: str


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
