from __future__ import annotations

import logging

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are BetterSSB Advisor, a friendly and knowledgeable university course advisor. "
    "You help students choose classes, plan their semester schedules, understand degree "
    "requirements, and prepare for registration. You give concise, actionable advice. "
    "When the student provides their transcript or course list, reference specific courses. "
    "If you are unsure about a policy, say so rather than guessing."
)


class ChatbotService:
    """Thin wrapper around the OpenAI chat completions API for academic advising."""

    def __init__(self, api_key: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)

    async def chat(self, messages: list[dict], context: str = "") -> str:
        """Send a conversation to the model and return the assistant reply.

        Args:
            messages: OpenAI-formatted message dicts (role + content).
            context: Optional extra context (e.g. transcript summary) injected
                     into the system prompt.
        """
        system_content = SYSTEM_PROMPT
        if context:
            system_content += f"\n\nAdditional context about this student:\n{context}"

        full_messages = [{"role": "system", "content": system_content}, *messages]

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=full_messages,
                temperature=0.7,
                max_tokens=1024,
            )
            return response.choices[0].message.content or ""
        except Exception:
            logger.exception("OpenAI chat request failed")
            raise
