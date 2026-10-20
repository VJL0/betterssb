from __future__ import annotations

import json

import httpx
import pytest

from app.modules.rmp.client import (
    ROSTER_PAGE_SIZE,
    TEMPLE_SCHOOL_ID,
    RMPClient,
    RMPUnavailable,
)


def roster_response(nodes: list[dict], end_cursor: str | None) -> dict:
    return {
        "data": {
            "newSearch": {
                "teachers": {
                    "pageInfo": {
                        "hasNextPage": end_cursor is not None,
                        "endCursor": end_cursor or "last",
                    },
                    "edges": [{"node": node} for node in nodes],
                }
            }
        }
    }


class TestRosterPage:
    async def test_lists_temples_main_campus_a_page_at_a_time(self):
        sent: list[dict] = []

        def handler(request: httpx.Request) -> httpx.Response:
            sent.append(json.loads(request.content))
            return httpx.Response(
                200, json=roster_response([{"firstName": "Jane"}], "cursor-1")
            )

        client = RMPClient(transport=httpx.MockTransport(handler))
        page = await client.roster_page(after="cursor-0")

        assert TEMPLE_SCHOOL_ID == "U2Nob29sLTk5OQ=="  # School-999, Philadelphia
        assert sent[0]["variables"] == {
            "schoolID": TEMPLE_SCHOOL_ID,
            "first": ROSTER_PAGE_SIZE,
            "after": "cursor-0",
        }
        assert page.professors == [{"firstName": "Jane"}]
        assert page.next_cursor == "cursor-1"

    async def test_last_page_has_no_cursor(self):
        client = RMPClient(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json=roster_response([], None))
            )
        )
        assert (await client.roster_page()).next_cursor is None

    @pytest.mark.parametrize(
        "response",
        [httpx.Response(503), httpx.Response(200, json={"errors": [{}]})],
    )
    async def test_failures_raise_unavailable(self, response: httpx.Response):
        client = RMPClient(transport=httpx.MockTransport(lambda _: response))
        with pytest.raises(RMPUnavailable):
            await client.roster_page()
