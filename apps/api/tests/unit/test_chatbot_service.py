from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    UserPromptPart,
)

from app.modules.chatbot.client import conversation_messages
from app.modules.chatbot.service import SYSTEM_PROMPT, ChatbotService


def test_preserves_conversation_roles_and_text():
    history = conversation_messages(
        [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
            {"role": "user", "content": "Help me plan"},
        ],
        "Instructions",
    )
    assert isinstance(history[0], ModelRequest)
    assert isinstance(history[0].parts[0], SystemPromptPart)
    assert history[0].parts[0].content == "Instructions"
    assert isinstance(history[1].parts[0], UserPromptPart)
    assert history[1].parts[0].content == "Hi"
    assert isinstance(history[2], ModelResponse)
    assert history[2].parts == [TextPart("Hello")]
    assert history[3].parts[0].content == "Help me plan"


async def test_includes_context_and_closes_stream():
    closed = False

    class Client:
        async def stream_completion(self, messages, *, system_instruction):
            nonlocal closed
            assert messages == [{"role": "user", "content": "Hi"}]
            assert system_instruction.startswith(SYSTEM_PROMPT)
            assert system_instruction.endswith("Junior, CS major")
            try:
                yield "Take CIS 1068 first."
            finally:
                closed = True

    service = ChatbotService("test", "groq-test")
    service._client = Client()
    assert [
        text
        async for text in service.stream(
            [{"role": "user", "content": "Hi"}], context="Junior, CS major"
        )
    ] == ["Take CIS 1068 first."]
    assert closed
