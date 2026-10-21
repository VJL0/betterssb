from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import aclosing

from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-3.8-flash"
# 3.8 Flash defaults to "medium"; advising replies are short, so less thinking
# just cuts latency. It rejects "minimal".
THINKING_LEVEL = "low"

# Gemini calls the assistant's turns "model".
GEMINI_ROLES = {"user": "user", "assistant": "model"}


def generation_request(
    messages: list[dict],
    system_instruction: str,
) -> tuple[list[types.Content], types.GenerateContentConfig]:
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
    return contents, config


class GeminiClient:
    """Calls generateContent, not the Interactions API.

    Interactions is still in beta, and its stateless mode needs the model's signed
    thought steps resent verbatim. Our clients only keep each turn's text.
    """

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    async def stream_completion(
        self,
        messages: list[dict],
        *,
        system_instruction: str,
        model: str = DEFAULT_MODEL,
    ) -> AsyncIterator[str]:
        contents, config = generation_request(messages, system_instruction)
        has_text = False
        finish_reason = None
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            )
            async with aclosing(stream):
                async for chunk in stream:
                    if chunk.prompt_feedback and chunk.prompt_feedback.block_reason:
                        raise ValueError("Generation blocked")
                    for candidate in chunk.candidates or []:
                        if candidate.finish_reason:
                            finish_reason = candidate.finish_reason
                    if chunk.text:
                        has_text = True
                        yield chunk.text
            if not has_text or finish_reason != types.FinishReason.STOP:
                raise ValueError("Generation did not complete")
        finally:
            await self._client.aio.aclose()
