import json

import pytest

from app.main import app
from app.modules.chatbot import router as router_module
from app.modules.chatbot.router import stream_service


@pytest.mark.parametrize("fails", [False, True])
async def test_stream_contract(client, fails):
    class Service:
        provider = "groq"

        async def stream(self, messages, context):
            assert context == "My audit"
            yield "First"
            if fails:
                raise RuntimeError("private provider details")
            yield " second"

    app.dependency_overrides[stream_service] = lambda: Service()
    try:
        response = await client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Hi"}],
                "context": "My audit",
            },
        )
    finally:
        app.dependency_overrides.pop(stream_service)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, no-transform"
    assert response.headers["content-type"].startswith("text/event-stream")
    events = [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data:") and line != "data: [DONE]"
    ]
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert events[0]["type"] == "start"
    assert events[1]["type"] == "text-start"
    assert events[2] == {"type": "text-delta", "id": events[1]["id"], "delta": "First"}
    assert events[-1]["type"] == ("error" if fails else "finish")
    if not fails:
        assert events[-2] == {"type": "text-end", "id": events[1]["id"]}
        assert events[-1]["finishReason"] == "stop"
        assert events[-1]["messageMetadata"] == {"provider": "groq"}
    assert response.text.endswith("data: [DONE]\n\n")
    assert "private provider details" not in response.text


async def test_missing_key_is_problem_before_stream(client, monkeypatch):
    monkeypatch.setattr(app.state.settings, "GOOGLE_API_KEY", "")
    response = await client.post("/api/chat", json={"messages": []})
    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"


@pytest.mark.parametrize(
    ("preferences", "provider", "effort"),
    [({}, "gemini", "low"), ({"provider": "groq", "effort": "high"}, "groq", "high")],
)
async def test_routes_chat_preferences(
    client, monkeypatch, preferences, provider, effort
):
    class Service:
        def __init__(self, *, google_api_key, groq_api_key, preferred_provider, effort):
            assert preferred_provider == provider
            self.provider = preferred_provider
            self.effort = effort

        async def stream(self, messages, context):
            assert self.effort == effort
            yield "Hello"

    monkeypatch.setattr(app.state.settings, "GOOGLE_API_KEY", "test")
    monkeypatch.setattr(router_module, "ChatbotService", Service)
    response = await client.post("/api/chat", json={"messages": [], **preferences})
    assert response.status_code == 200
    assert f'"provider": "{provider}"' in response.text


@pytest.mark.parametrize(
    "preferences", [{"provider": "unknown"}, {"effort": "unknown"}]
)
async def test_rejects_unknown_chat_preferences(client, preferences):
    response = await client.post("/api/chat", json={"messages": [], **preferences})
    assert response.status_code == 422


def test_chat_has_only_a_streaming_contract():
    schema = app.openapi()
    assert "/api/chat/stream" not in schema["paths"]
    content = schema["paths"]["/api/chat"]["post"]["responses"]["200"]["content"]
    assert set(content) == {"text/event-stream"}
    assert "ChatReply" not in schema["components"]["schemas"]
