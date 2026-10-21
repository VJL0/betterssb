import json
from contextlib import aclosing

import httpx
import pytest
from pydantic_ai.exceptions import ModelHTTPError

from app.modules.chatbot import client as client_module
from app.modules.chatbot.client import FALLBACK_MODEL, PRIMARY_MODEL, AdvisorClient


def google_chunk(text=None, finish=None):
    candidate = {
        "content": {"parts": [{"text": text}] if text else [], "role": "model"}
    }
    if finish:
        candidate["finishReason"] = finish
    return "data: " + json.dumps({"candidates": [candidate]}) + "\n\n"


def groq_chunk(text=None, finish=None):
    return (
        "data: "
        + json.dumps(
            {
                "id": "reply",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": FALLBACK_MODEL,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": text} if text else {},
                        "finish_reason": finish,
                    }
                ],
            }
        )
        + "\n\n"
    )


@pytest.fixture
def mock_provider(monkeypatch):
    clients = []
    original = httpx.AsyncClient

    def install(handler):
        def create(**kwargs):
            client = original(transport=httpx.MockTransport(handler), **kwargs)
            clients.append(client)
            return client

        monkeypatch.setattr(client_module, "AsyncClient", create)
        return clients

    return install


async def test_google_deadline_meets_provider_minimum(mock_provider):
    minimum_deadline_seconds = 10

    def handler(request):
        deadline = float(request.headers["X-Server-Timeout"])
        if deadline < minimum_deadline_seconds:
            return httpx.Response(
                400, json={"error": {"code": 400, "message": "Deadline too short"}}
            )
        return httpx.Response(200, text=google_chunk("OK", "STOP"))

    mock_provider(handler)
    assert [
        text
        async for text in AdvisorClient("google-test").stream_completion(
            [{"role": "user", "content": "Hi"}], system_instruction="Help"
        )
    ] == ["OK"]


@pytest.mark.parametrize("preferred_provider", ["gemini", "groq"])
@pytest.mark.parametrize("effort", ["low", "high"])
async def test_sticks_to_preferred_provider_and_recovers(
    mock_provider, preferred_provider, effort
):
    hosts = []
    request_bodies = []
    google_host = "generativelanguage.googleapis.com"
    groq_host = "api.groq.com"
    preferred_host = google_host if preferred_provider == "gemini" else groq_host

    def handler(request):
        hosts.append(request.url.host)
        request_bodies.append(json.loads(request.content))
        if request.url.host == preferred_host:
            return httpx.Response(
                503,
                json={
                    "error": {"code": 503, "status": "UNAVAILABLE", "message": "Busy"}
                },
            )
        if request.url.host == google_host:
            return httpx.Response(200, text=google_chunk("Recovered", "STOP"))
        return httpx.Response(
            200, text=groq_chunk("Recovered", "stop") + "data: [DONE]\n\n"
        )

    mock_provider(handler)
    client = AdvisorClient(
        "google-test", "groq-test", preferred_provider=preferred_provider, effort=effort
    )
    assert [
        text async for text in client.stream_completion([], system_instruction="Help")
    ] == ["Recovered"]
    assert hosts[-1] == (groq_host if preferred_host == google_host else google_host)
    assert all(host == preferred_host for host in hosts[:-1])
    assert client.provider == ("groq" if preferred_provider == "gemini" else "gemini")
    for host, body in zip(hosts, request_bodies):
        if host == google_host:
            assert (
                body["generationConfig"]["thinkingConfig"]["thinking_level"].lower()
                == effort
            )
        else:
            assert body["reasoning_effort"] == effort


async def test_successful_groq_chat_does_not_probe_gemini(mock_provider):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(
            200, text=groq_chunk("Hello", "stop") + "data: [DONE]\n\n"
        )

    mock_provider(handler)
    client = AdvisorClient("google-test", "groq-test", preferred_provider="groq")
    assert [
        text async for text in client.stream_completion([], system_instruction="Help")
    ] == ["Hello"]
    assert hosts == ["api.groq.com"]
    assert client.provider == "groq"


@pytest.mark.parametrize("status", [404, 429, 500, 503])
async def test_fallback_and_provider_settings(mock_provider, status):
    requests = []

    def handler(request):
        requests.append(request)
        if "googleapis" in request.url.host:
            return httpx.Response(
                status, json={"error": {"code": status, "message": "Unavailable"}}
            )
        return httpx.Response(
            200,
            text=groq_chunk("Fallback reply")
            + groq_chunk(finish="stop")
            + "data: [DONE]\n\n",
        )

    clients = mock_provider(handler)
    client = AdvisorClient("google-test", "groq-test")
    result = [
        text
        async for text in client.stream_completion(
            [{"role": "user", "content": "Hi"}], system_instruction="Help"
        )
    ]
    assert result == ["Fallback reply"]
    google = json.loads(requests[0].content)
    groq = json.loads(requests[-1].content)
    assert PRIMARY_MODEL in str(requests[0].url)
    assert (
        google["generationConfig"]["thinkingConfig"]["thinking_level"].lower() == "low"
    )
    assert groq["model"] == FALLBACK_MODEL
    assert groq["reasoning_effort"] == "low"
    assert groq["reasoning_format"] == "hidden"
    assert groq["messages"] == [
        {"role": "system", "content": "Help"},
        {"role": "user", "content": "Hi"},
    ]
    assert all(client.is_closed for client in clients)


@pytest.mark.parametrize("status", [400, 401, 403])
async def test_request_errors_do_not_fallback(mock_provider, status):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(
            status, json={"error": {"code": status, "message": "Failed"}}
        )

    mock_provider(handler)
    with pytest.raises(ModelHTTPError):
        async for _ in AdvisorClient("google-test", "groq-test").stream_completion(
            [], system_instruction="Help"
        ):
            pass
    assert all("googleapis" in host for host in hosts)


@pytest.mark.parametrize("finish", ["STOP", "MAX_TOKENS", "SAFETY"])
async def test_finish_and_partial_reply(mock_provider, finish):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(
            200, text=google_chunk("Hello") + google_chunk(finish=finish)
        )

    clients = mock_provider(handler)
    received = []

    client = AdvisorClient("google-test", "groq-test")

    async def consume():
        async for text in client.stream_completion([], system_instruction="Help"):
            received.append(text)

    if finish == "STOP":
        await consume()
    else:
        with pytest.raises(ValueError, match="did not complete"):
            await consume()
    assert received == ["Hello"]
    assert len(hosts) == 1
    assert client.provider == ("gemini" if finish == "STOP" else None)
    assert all(client.is_closed for client in clients)


async def test_cancellation_closes_client(mock_provider):
    clients = mock_provider(
        lambda request: httpx.Response(
            200, text=google_chunk("Hello") + google_chunk(" world", "STOP")
        )
    )
    async with aclosing(
        AdvisorClient("google-test").stream_completion([], system_instruction="Help")
    ) as stream:
        assert await anext(stream) == "Hello"
    assert all(client.is_closed for client in clients)


async def test_missing_fallback_key_keeps_primary(mock_provider):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(404, json={"error": {"code": 404, "message": "Missing"}})

    mock_provider(handler)
    with pytest.raises(ModelHTTPError):
        async for _ in AdvisorClient("google-test").stream_completion(
            [], system_instruction="Help"
        ):
            pass
    assert len(hosts) == 1


async def test_both_providers_failing_ends_reply(mock_provider):
    from pydantic_ai.exceptions import FallbackExceptionGroup

    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(404, json={"error": {"code": 404, "message": "Missing"}})

    clients = mock_provider(handler)
    client = AdvisorClient("google-test", "groq-test")
    with pytest.raises(FallbackExceptionGroup):
        async for _ in client.stream_completion([], system_instruction="Help"):
            pass
    assert hosts == ["generativelanguage.googleapis.com", "api.groq.com"]
    assert client.provider is None
    assert all(client.is_closed for client in clients)


async def test_empty_reply_is_rejected(mock_provider):
    mock_provider(lambda request: httpx.Response(200, text=google_chunk(finish="STOP")))
    from pydantic_ai.exceptions import UnexpectedModelBehavior

    with pytest.raises((ValueError, UnexpectedModelBehavior)):
        async for _ in AdvisorClient("google-test", "groq-test").stream_completion(
            [], system_instruction="Help"
        ):
            pass


async def test_thinking_is_not_sent_as_reply_text(mock_provider):
    thinking = (
        "data: "
        + json.dumps(
            {
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [{"text": "Private thoughts", "thought": True}],
                        }
                    }
                ]
            }
        )
        + "\n\n"
    )
    mock_provider(
        lambda request: httpx.Response(
            200, text=thinking + google_chunk("Answer", "STOP")
        )
    )
    assert [
        text
        async for text in AdvisorClient("google-test").stream_completion(
            [], system_instruction="Help"
        )
    ] == ["Answer"]
