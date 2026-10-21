from __future__ import annotations

from app.modules.chatbot.client import GeminiClient

SYSTEM_PROMPT = (
    "You are BetterSSB Advisor, a friendly and knowledgeable university course advisor. "
    "You help students choose classes, plan their semester schedules, understand degree "
    "requirements, and prepare for registration. You give concise, actionable advice. "
    "When the student provides their transcript or course list, reference specific courses. "
    "If you are unsure about a policy, say so rather than guessing."
)


class ChatbotService:
    """Academic advising chatbot backed by Gemini."""

    def __init__(self, api_key: str) -> None:
        self._client = GeminiClient(api_key=api_key)

    async def chat(self, messages: list[dict], context: str = "") -> str:
        system_content = SYSTEM_PROMPT
        if context:
            system_content += f"\n\nAdditional context about this student:\n{context}"

        return await self._client.chat_completion(
            messages, system_instruction=system_content
        )
