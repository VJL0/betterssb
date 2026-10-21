from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.modules.chatbot.client import GeminiClient


async def test_stream_yields_before_completion_and_closes():
    client = GeminiClient(api_key="test")
    closed = False

    async def chunks():
        nonlocal closed
        try:
            yield SimpleNamespace(text="Hello", candidates=[], prompt_feedback=None)
            raise AssertionError("requested another chunk after cancellation")
        finally:
            closed = True

    upstream = chunks()
    close = AsyncMock()
    client._client = SimpleNamespace(
        aio=SimpleNamespace(
            models=SimpleNamespace(
                generate_content_stream=AsyncMock(return_value=upstream)
            ),
            aclose=close,
        )
    )
    stream = client.stream_completion(
        [{"role": "user", "content": "Hi"}], system_instruction="Help"
    )
    assert await anext(stream) == "Hello"
    await stream.aclose()
    assert closed
    close.assert_awaited_once()


async def test_stream_requires_successful_finish():
    client = GeminiClient(api_key="test")

    async def chunks():
        yield SimpleNamespace(text="Partial", candidates=[], prompt_feedback=None)

    client._client = SimpleNamespace(
        aio=SimpleNamespace(
            models=SimpleNamespace(
                generate_content_stream=AsyncMock(return_value=chunks())
            ),
            aclose=AsyncMock(),
        )
    )
    with pytest.raises(ValueError):
        async for _ in client.stream_completion([], system_instruction="Help"):
            pass


async def test_stream_success_and_metadata():
    client = GeminiClient(api_key="test")

    async def chunks():
        yield SimpleNamespace(text=None, candidates=[], prompt_feedback=None)
        yield SimpleNamespace(text="Hello", candidates=[], prompt_feedback=None)
        yield SimpleNamespace(
            text=None,
            candidates=[SimpleNamespace(finish_reason="STOP")],
            prompt_feedback=None,
        )

    models = SimpleNamespace(generate_content_stream=AsyncMock(return_value=chunks()))
    close = AsyncMock()
    client._client = SimpleNamespace(aio=SimpleNamespace(models=models, aclose=close))
    result = [
        text
        async for text in client.stream_completion(
            [{"role": "assistant", "content": "Hi"}],
            system_instruction="Student context",
        )
    ]
    assert result == ["Hello"]
    args = models.generate_content_stream.call_args.kwargs
    assert args["contents"][0].role == "model"
    assert args["config"].system_instruction == "Student context"
    close.assert_awaited_once()
