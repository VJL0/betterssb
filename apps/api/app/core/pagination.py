"""Opaque page cursors (Zalando #160, Google AIP-158).

Clients pass back the cursor a page gave them and never read it, so the API can
change what it holds. Today that's the offset of the next page, since Banner
pages by offset.
"""

from __future__ import annotations

import base64
import binascii
import json


class InvalidCursor(ValueError):
    """The cursor wasn't one this API gave out."""


def encode_cursor(offset: int) -> str:
    raw = json.dumps({"offset": offset}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def decode_cursor(cursor: str) -> int:
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        offset = json.loads(base64.urlsafe_b64decode(padded))["offset"]
    except (binascii.Error, ValueError, KeyError, TypeError) as exc:
        raise InvalidCursor from exc
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        raise InvalidCursor
    return offset
