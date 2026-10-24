"""Fetched bytes, content-addressed and immutable.

An object's key is the SHA-256 of its uncompressed bytes; the file is
Zstandard-compressed (Python 3.14's `compression.zstd`), which shrinks
CourseLeaf HTML about tenfold. Writing the same bytes twice is a no-op, so
snapshots of a page that later changed are never lost, and every extracted
fact can be re-derived offline from the exact bytes it came from.

The key is what an S3-style bucket would use too; moving the store there
changes this class only.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from compression import zstd
from pathlib import Path

ZSTD_LEVEL = 10
OBJECT_SUFFIX = ".zst"


def sha256_hex(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


class ObjectStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, sha256: str) -> Path:
        # Two-level fan-out keeps directories small at tens of thousands of objects.
        return self.root / sha256[:2] / f"{sha256}{OBJECT_SUFFIX}"

    def has(self, sha256: str) -> bool:
        return self.path(sha256).exists()

    def put(self, body: bytes) -> str:
        """Store the bytes once and return their SHA-256."""
        sha256 = sha256_hex(body)
        path = self.path(sha256)
        if path.exists():
            return sha256
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write then rename, so an interrupted write never leaves a truncated object.
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            handle.write(zstd.compress(body, level=ZSTD_LEVEL))
            temporary = Path(handle.name)
        os.replace(temporary, path)
        return sha256

    def get(self, sha256: str) -> bytes:
        body = zstd.decompress(self.path(sha256).read_bytes())
        if sha256_hex(body) != sha256:
            raise ValueError(f"Object {sha256} is corrupt")
        return body
