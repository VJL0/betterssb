from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import aclosing

from app.modules.chatbot.client import GeminiClient

SYSTEM_PROMPT = (
    "You are BetterSSB Advisor, a friendly and knowledgeable university course advisor. "
    "You help students choose classes, plan their semester schedules, understand degree "
    "requirements, and prepare for registration. You give concise, actionable advice. "
    "When the student provides their transcript or course list, reference specific courses. "
    "If you are unsure about a policy, say so rather than guessing."
)


def system_instruction(context: str) -> str:
    if context:
        return SYSTEM_PROMPT + f"\n\nAdditional context about this student:\n{context}"
    return SYSTEM_PROMPT


class ChatbotService:
    """Academic advising chatbot backed by Gemini."""

    def __init__(self, api_key: str) -> None:
        self._client = GeminiClient(api_key=api_key)

    async def stream(
        self, messages: list[dict], context: str = ""
    ) -> AsyncIterator[str]:
        system_content = system_instruction(context)
        async with aclosing(
            self._client.stream_completion(messages, system_instruction=system_content)
        ) as stream:
            async for text in stream:
                yield text
