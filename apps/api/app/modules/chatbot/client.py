from __future__ import annotations

import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.8-flash"
# 3.8 Flash defaults to "medium"; advising replies are short, so less thinking
# just cuts latency. It rejects "minimal".
THINKING_LEVEL = "low"

# Gemini calls the assistant's turns "model".
GEMINI_ROLES = {"user": "user", "assistant": "model"}


class GeminiClient:
    """Calls generateContent, not the Interactions API.

    Interactions is still in beta, and its stateless mode needs the model's signed
    thought steps resent verbatim. Our clients only keep each turn's text.
    """

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    async def chat_completion(
        self,
        messages: list[dict],
        *,
        system_instruction: str,
        model: str = DEFAULT_MODEL,
    ) -> str:
        contents = [
            types.Content(
                role=GEMINI_ROLES[m["role"]], parts=[types.Part(text=m["content"])]
            )
            for m in messages
        ]
        # No max_output_tokens or temperature: thinking tokens count toward the
        # output cap, so a low cap can cut replies short, and Gemini 3.6+ ignores
        # temperature.
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL),
        )
        try:
            response = await self._client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
            return response.text or ""
        except Exception:
            logger.exception("Gemini chat request failed")
            raise
