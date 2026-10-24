"""Bytes the crawler didn't fetch itself: earlier captures and hand downloads.

robots.txt keeps the crawler out of `/archives/` and `/pdf/`, so archived
editions and full-volume PDFs come from files already on disk: the 2024-2025
capture from an earlier session, or PDFs a person downloaded from the archives
page in a browser. Each is recorded under its official URL with status
`imported` and the method that brought it in, so the manifest says exactly
where every snapshot came from.

A capture directory holds `inventory.jsonl` (one JSON object per response:
url, status, content_type, file, sha256, fetched_at?) and the files it names.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.modules.bulletin.ingest.crawl_state import CrawlState, FetchRecord, UrlStatus
from app.modules.bulletin.ingest.discover import page_links
from app.modules.bulletin.ingest.store import ObjectStore, sha256_hex
from app.modules.bulletin.ingest.urls import classify_url, normalize_url

logger = logging.getLogger(__name__)

INVENTORY_FILE = "inventory.jsonl"
PDF_CONTENT_TYPE = "application/pdf"


@dataclass(slots=True)
class ImportSummary:
    imported: int = 0
    skipped: int = 0
    mismatched: int = 0


def import_capture(
    state: CrawlState, store: ObjectStore, directory: Path, method: str
) -> ImportSummary:
    summary = ImportSummary()
    with (directory / INVENTORY_FILE).open() as inventory:
        entries = [json.loads(line) for line in inventory if line.strip()]
    for entry in entries:
        url = normalize_url(entry["url"])
        path = directory / entry["file"]
        if url is None or not path.exists():
            summary.skipped += 1
            continue
        body = path.read_bytes()
        if entry.get("sha256") and sha256_hex(body) != entry["sha256"]:
            # The capture's own record disagrees with its file: keep neither.
            logger.warning("%s: file hash differs from its inventory entry", url)
            summary.mismatched += 1
            continue
        fetched_at = (
            entry.get("fetched_at")
            or datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat()
        )
        content_type = entry.get("content_type") or ""
        sha256 = _record_import(
            state,
            store,
            url,
            body,
            content_type,
            entry.get("status", 200),
            entry.get("final_url"),
            fetched_at,
            method,
        )
        if sha256 and content_type.startswith("text/html"):
            record_page_links(state, url, body)
        summary.imported += 1
    state.commit()
    return summary


def record_page_links(state: CrawlState, url: str, body: bytes) -> None:
    """Discover an imported page's links offline, as the crawler would online."""
    links = page_links(body, url)
    state.set_page_facts(url, links.title, links.canonical_url)
    for link in links.links:
        if link.url == url:
            continue
        state.record_link(url, link.url, link.method, link.anchor_text)
        state.record_url(classify_url(link.url), link.method, url, 1)


def import_file(
    state: CrawlState,
    store: ObjectStore,
    path: Path,
    official_url: str,
    method: str = "manual_download",
) -> str:
    """Record a hand-downloaded file under the official URL it came from."""
    url = normalize_url(official_url)
    if url is None:
        raise ValueError(f"Not an http(s) URL: {official_url}")
    body = path.read_bytes()
    content_type = PDF_CONTENT_TYPE if body.startswith(b"%PDF") else "text/html"
    fetched_at = datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat()
    sha256 = _record_import(
        state, store, url, body, content_type, 200, None, fetched_at, method
    )
    state.commit()
    return sha256


def _record_import(
    state: CrawlState,
    store: ObjectStore,
    url: str,
    body: bytes,
    content_type: str,
    http_status: int,
    final_url: str | None,
    fetched_at: str,
    method: str,
) -> str:
    sha256 = store.put(body) if http_status == 200 else None
    state.record_url(classify_url(url), method)
    state.record_fetch(
        url,
        FetchRecord(
            status=UrlStatus.IMPORTED if sha256 else UrlStatus.FAILED,
            http_status=http_status,
            final_url=normalize_url(final_url) if final_url else url,
            redirect_chain=[],
            content_type=content_type,
            sha256=sha256,
            size=len(body),
            etag=None,
            last_modified=None,
            error=None if sha256 else f"HTTP {http_status} in capture",
            fetched_at=fetched_at,
        ),
    )
    return sha256 or ""
