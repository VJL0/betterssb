"""Error responses are RFC 9457 problem details."""

from __future__ import annotations

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.errors import add_error_handlers
from app.core.security import SECURITY_HEADERS

PROBLEM_JSON = "application/problem+json"


class TestProblemDetails:
    async def test_not_found(self, client: AsyncClient):
        resp = await client.get("/api/does-not-exist")

        assert resp.status_code == 404
        assert resp.headers["content-type"] == PROBLEM_JSON
        assert resp.json() == {
            "type": "about:blank",
            "title": "Not Found",
            "status": 404,
        }

    async def test_method_not_allowed_keeps_allow_header(self, client: AsyncClient):
        resp = await client.delete("/health")

        assert resp.status_code == 405
        assert resp.headers["allow"] == "GET"
        assert resp.json()["title"] == "Method Not Allowed"

    async def test_body_validation_errors_point_into_the_body(
        self, client: AsyncClient
    ):
        resp = await client.post(
            "/api/schedule/generate", json={"sections": [{"crn": 1}]}
        )

        assert resp.status_code == 422
        assert resp.headers["content-type"] == PROBLEM_JSON
        problem = resp.json()
        assert problem["title"] == "Unprocessable Content"
        assert {
            "detail": "Input should be a valid string",
            "pointer": "#/sections/0/crn",
        } in problem["errors"]
        # Request data isn't echoed back.
        assert all(set(e) == {"detail", "pointer"} for e in problem["errors"])

    async def test_parameter_validation_errors_name_the_parameter(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/rmp/search")

        assert resp.status_code == 422
        assert resp.json()["errors"] == [
            {"detail": "Field required", "in": "query", "name": "name"}
        ]


class TestUnexpectedErrors:
    async def test_crash_returns_a_generic_problem(self):
        app = FastAPI()
        add_error_handlers(app)

        @app.get("/boom")
        async def boom():
            raise RuntimeError("database password is hunter2")

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="https://test") as c:
            resp = await c.get("/boom")

        assert resp.status_code == 500
        assert resp.headers["content-type"] == PROBLEM_JSON
        assert resp.json() == {
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
        }
        for name, value in SECURITY_HEADERS.items():
            assert resp.headers[name] == value
