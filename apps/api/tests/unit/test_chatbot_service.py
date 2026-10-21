from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.modules.chatbot.service import SYSTEM_PROMPT, ChatbotService


class FakeModels:
    def __init__(self, reply: str | None) -> None:
        self.reply = reply
        self.calls: list[dict] = []

    async def generate_content_stream(self, **kwargs):
        self.calls.append(kwargs)

        async def chunks():
            yield SimpleNamespace(
                text=self.reply,
                candidates=[SimpleNamespace(finish_reason=types.FinishReason.STOP)],
                prompt_feedback=None,
            )

        return chunks()


def service_with_reply(reply: str | None) -> tuple[ChatbotService, FakeModels]:
    service = ChatbotService(api_key="test-key")
    models = FakeModels(reply)
    service._client._client = SimpleNamespace(
        aio=SimpleNamespace(models=models, aclose=AsyncMock())
    )
    return service, models


async def test_sends_assistant_turns_as_gemini_model_turns():
    service, models = service_with_reply("Take CIS 1068 first.")

    reply = [
        text
        async for text in service.stream(
            [
                {"role": "user", "content": "What should I take?"},
                {"role": "assistant", "content": "What's your major?"},
                {"role": "user", "content": "Computer science."},
            ]
        )
    ]

    assert reply == ["Take CIS 1068 first."]
    contents = models.calls[0]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[2].parts[0].text == "Computer science."


async def test_puts_student_context_in_the_system_instruction():
    service, models = service_with_reply("Sure.")

    [
        text
        async for text in service.stream(
            [{"role": "user", "content": "Hi"}], context="Junior, CS major"
        )
    ]

    system_instruction = models.calls[0]["config"].system_instruction
    assert system_instruction.startswith(SYSTEM_PROMPT)
    assert system_instruction.endswith("Junior, CS major")


async def test_thinks_lightly_without_capping_output():
    service, models = service_with_reply("Sure.")

    [text async for text in service.stream([{"role": "user", "content": "Hi"}])]

    config = models.calls[0]["config"]
    assert config.thinking_config.thinking_level == types.ThinkingLevel.LOW
    # Thinking tokens count toward max_output_tokens, so a cap can truncate.
    assert config.max_output_tokens is None
    assert config.temperature is None


async def test_rejects_empty_generation():
    service, _ = service_with_reply(None)

    with pytest.raises(ValueError, match="Generation did not complete"):
        [text async for text in service.stream([{"role": "user", "content": "Hi"}])]
