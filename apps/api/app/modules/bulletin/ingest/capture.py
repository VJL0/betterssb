"""A capture is a directory of fetched Bulletin responses and their inventory.

The layout matches the earlier 2024-2025 comparison crawl, so both are read the
same way: `inventory.jsonl` has one JSON object per fetched URL, and each
response's bytes are in `responses/<sha256 of url>.<html|pdf>`.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

INVENTORY_FILE = "inventory.jsonl"
RESPONSES_DIR = "responses"
HTML_CONTENT_TYPE = "text/html"


@dataclass(frozen=True, slots=True)
class CapturedResponse:
    url: str
    status: int
    content_type: str
    sha256: str
    path: Path
    fetched_at: datetime

    @property
    def is_html(self) -> bool:
        return self.status == 200 and self.content_type.startswith(HTML_CONTENT_TYPE)

    def read_text(self) -> str:
        return self.path.read_bytes().decode("utf-8", errors="replace")


def response_file_name(url: str, content_type: str) -> str:
    extension = "html" if content_type.startswith(HTML_CONTENT_TYPE) else "pdf"
    return f"{hashlib.sha256(url.encode()).hexdigest()}.{extension}"


def read_capture(directory: Path) -> Iterator[CapturedResponse]:
    """Yield each captured response once, keeping the last entry for a URL."""
    latest: dict[str, CapturedResponse] = {}
    with (directory / INVENTORY_FILE).open() as inventory:
        for line in inventory:
            entry = json.loads(line)
            path = directory / entry["file"]
            fetched_at = entry.get("fetched_at")
            latest[entry["url"]] = CapturedResponse(
                url=entry["url"],
                status=entry["status"],
                content_type=entry.get("content_type") or "",
                sha256=entry["sha256"],
                path=path,
                fetched_at=(
                    datetime.fromisoformat(fetched_at)
                    if fetched_at
                    # The comparison crawl didn't record a time; its files did.
                    else datetime.fromtimestamp(path.stat().st_mtime, UTC)
                ),
            )
    yield from latest.values()


class CaptureWriter:
    """Appends responses to a capture, so an interrupted crawl can resume."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        (directory / RESPONSES_DIR).mkdir(parents=True, exist_ok=True)
        self.inventory_path = directory / INVENTORY_FILE

    def captured_urls(self) -> set[str]:
        if not self.inventory_path.exists():
            return set()
        with self.inventory_path.open() as inventory:
            return {json.loads(line)["url"] for line in inventory}

    def write(
        self, url: str, status: int, content_type: str, body: bytes
    ) -> CapturedResponse:
        relative = Path(RESPONSES_DIR) / response_file_name(url, content_type)
        path = self.directory / relative
        path.write_bytes(body)
        fetched_at = datetime.now(UTC)
        sha256 = hashlib.sha256(body).hexdigest()
        entry = {
            "url": url,
            "status": status,
            "content_type": content_type,
            "bytes": len(body),
            "file": str(relative),
            "sha256": sha256,
            "fetched_at": fetched_at.isoformat(),
        }
        with self.inventory_path.open("a") as inventory:
            inventory.write(json.dumps(entry) + "\n")
        return CapturedResponse(url, status, content_type, sha256, path, fetched_at)
