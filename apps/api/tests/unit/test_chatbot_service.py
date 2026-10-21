from __future__ import annotations

from types import SimpleNamespace

from google.genai import types

from app.modules.chatbot.service import SYSTEM_PROMPT, ChatbotService


class FakeModels:
    def __init__(self, reply: str | None) -> None:
        self.reply = reply
        self.calls: list[dict] = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=self.reply)


def service_with_reply(reply: str | None) -> tuple[ChatbotService, FakeModels]:
    service = ChatbotService(api_key="test-key")
    models = FakeModels(reply)
    service._client._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return service, models


async def test_sends_assistant_turns_as_gemini_model_turns():
    service, models = service_with_reply("Take CIS 1068 first.")

    reply = await service.chat(
        [
            {"role": "user", "content": "What should I take?"},
            {"role": "assistant", "content": "What's your major?"},
            {"role": "user", "content": "Computer science."},
        ]
    )

    assert reply == "Take CIS 1068 first."
    contents = models.calls[0]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[2].parts[0].text == "Computer science."


async def test_puts_student_context_in_the_system_instruction():
    service, models = service_with_reply("Sure.")

    await service.chat([{"role": "user", "content": "Hi"}], context="Junior, CS major")

    system_instruction = models.calls[0]["config"].system_instruction
    assert system_instruction.startswith(SYSTEM_PROMPT)
    assert system_instruction.endswith("Junior, CS major")


async def test_thinks_lightly_without_capping_output():
    service, models = service_with_reply("Sure.")

    await service.chat([{"role": "user", "content": "Hi"}])

    config = models.calls[0]["config"]
    assert config.thinking_config.thinking_level == types.ThinkingLevel.LOW
    # Thinking tokens count toward max_output_tokens, so a cap can truncate.
    assert config.max_output_tokens is None
    assert config.temperature is None


async def test_returns_empty_string_when_gemini_sends_no_text():
    service, _ = service_with_reply(None)

    assert await service.chat([{"role": "user", "content": "Hi"}]) == ""
