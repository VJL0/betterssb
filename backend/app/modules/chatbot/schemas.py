from __future__ import annotations

from app.shared.schemas import BaseSchema


class ChatRequest(BaseSchema):
    messages: list[dict]
    context: str = ""


class ChatResponse(BaseSchema):
    response: str
