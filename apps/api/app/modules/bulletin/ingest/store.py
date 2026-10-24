"""Raw source bytes, content-addressed, outside the database.

Locally this is a directory; `raw_object_key` is the same key an S3-style store
would use, so moving to object storage changes this class and nothing else.
"""

from __future__ import annotations

import hashlib
from pathlib import Path


class RawObjectStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def put(self, body: bytes, extension: str) -> tuple[str, str]:
        """Store the bytes once; return their SHA-256 and object key."""
        sha256 = hashlib.sha256(body).hexdigest()
        key = f"{sha256}.{extension}"
        path = self.root / key
        if not path.exists():
            path.write_bytes(body)
        return sha256, key

    def get(self, key: str) -> bytes:
        return (self.root / key).read_bytes()
