from __future__ import annotations

from collections.abc import Iterator

import pytest
from httpx2 import AsyncClient

from app.main import app
from app.modules.rmp.router import RETRY_AFTER_SECONDS, get_rmp_roster
from tests.unit.test_rmp_service import (
    ROSTER,
    FakeRMP,
    finish_background_sync,
    roster_service,
)


@pytest.fixture()
def roster() -> Iterator:
    service, _ = roster_service(FakeRMP(ROSTER))
    app.dependency_overrides[get_rmp_roster] = lambda: service
    yield service
    app.dependency_overrides.pop(get_rmp_roster, None)


class TestSearchRoute:
    async def test_returns_camel_case_ratings(self, client: AsyncClient, roster):
        await roster.sync()
        resp = await client.get("/api/professors", params={"name": "Cindy Liao"})
        assert resp.status_code == 200
        assert resp.json()["professors"][0]["professorName"] == "Cindy Liao"

    async def test_unavailable_until_the_first_sync_finishes(
        self, client: AsyncClient, roster
    ):
        resp = await client.get("/api/professors", params={"name": "Cindy Liao"})
        assert resp.status_code == 503
        assert resp.headers["retry-after"] == str(RETRY_AFTER_SECONDS)
        await finish_background_sync(roster)

        resp = await client.get("/api/professors", params={"name": "Cindy Liao"})
        assert resp.status_code == 200
