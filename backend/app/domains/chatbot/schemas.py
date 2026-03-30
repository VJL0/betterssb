from __future__ import annotations

from pydantic import BaseModel


class ChatRequest(BaseModel):
    messages: list[dict]
    context: str = ""


class ChatResponse(BaseModel):
    response: str
