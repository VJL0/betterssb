from __future__ import annotations

from typing import Literal

from app.shared.schemas import BaseSchema


class ChatMessage(BaseSchema):
    # No "system": the server writes the system prompt, so a client can't.
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseSchema):
    messages: list[ChatMessage]
    context: str = ""
