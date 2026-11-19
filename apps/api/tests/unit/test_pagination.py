from __future__ import annotations

import pytest

from app.core.pagination import InvalidCursor, decode_cursor, encode_cursor


@pytest.mark.parametrize("offset", [0, 1, 50, 12_345])
def test_a_cursor_round_trips(offset: int) -> None:
    assert decode_cursor(encode_cursor(offset)) == offset


def test_a_cursor_is_url_safe() -> None:
    assert encode_cursor(50).isascii()
    assert not set(encode_cursor(50)) & set("+/=")


@pytest.mark.parametrize(
    "cursor",
    ["", "not base64!", "bnVsbA", encode_cursor(0)[:-2], "eyJvZmZzZXQiOi0xfQ"],
)
def test_a_cursor_this_api_didnt_give_is_invalid(cursor: str) -> None:
    with pytest.raises(InvalidCursor):
        decode_cursor(cursor)
