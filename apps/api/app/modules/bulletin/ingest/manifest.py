"""The URL manifest: one row per URL ever seen, with its outcome.

Exported from the crawl state as JSONL and CSV so it can be audited without
the ingester. Every eligible URL ends up fetched, imported, failed (with the
HTTP status or error) or blocked by robots.txt; every other URL carries the
reason it was left out.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.fetcher import USER_AGENT
from app.modules.bulletin.ingest.robots import HostRules, parse_rules

FIELDS = (
    "url",
    "canonical_url",
    "final_url",
    "edition",
    "level",
    "scope",
    "page_kind",
    "content_type",
    "eligible",
    "robots_allowed",
    "status",
    "http_status",
    "sha256",
    "bytes",
    "fetched_at",
    "last_modified",
    "etag",
    "discovered_via",
    "first_source_url",
    "inbound_links",
    "outbound_in_scope_links",
    "duplicate_of",
    "extraction_status",
    "extraction_detail",
    "reason",
    "title",
)


def preferred_url_order(url: str, final_url: str | None) -> tuple[bool, bool, int, str]:
    """Prefer the URL a person would cite: one that isn't a redirect source,
    in CourseLeaf's trailing-slash form (not `index.html`), then the shortest."""
    redirected = bool(final_url) and final_url != url
    return redirected, not url.endswith("/"), len(url), url


def mark_duplicates(state: CrawlState) -> int:
    """Point every URL whose bytes repeat another's at the preferred one."""
    by_hash: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    for row in state.rows():
        if row["sha256"]:
            by_hash[row["sha256"]].append((row["url"], row["final_url"]))
    marked = 0
    for urls in by_hash.values():
        preferred = min(urls, key=lambda pair: preferred_url_order(*pair))[0]
        for url, _ in urls:
            state.set_duplicate(url, preferred if url != preferred else None)
            marked += url != preferred
    state.commit()
    return marked


def _robots_rules(state: CrawlState) -> dict[str, HostRules]:
    return {
        row["host"]: parse_rules(row["host"], row["status"], row["body"])
        for row in state.db.execute("SELECT * FROM robots")
    }


def manifest_rows(state: CrawlState) -> list[dict[str, object]]:
    rules = _robots_rules(state)
    inbound = dict(
        state.db.execute(
            "SELECT to_url, count(DISTINCT from_url) FROM links GROUP BY 1"
        )
    )
    outbound = dict(
        state.db.execute(
            """SELECT l.from_url, count(DISTINCT l.to_url) FROM links l
            JOIN urls u ON u.url = l.to_url AND u.eligible = 1 GROUP BY 1"""
        )
    )
    rows = []
    for row in state.rows():
        columns = set(row.keys())
        record = {field: row[field] for field in FIELDS if field in columns}
        host = urlsplit(row["url"]).hostname or ""
        record["robots_allowed"] = (
            rules[host].allows(USER_AGENT, row["url"]) if host in rules else None
        )
        record["eligible"] = bool(row["eligible"])
        record["discovered_via"] = json.loads(row["discovered_via"])
        record["inbound_links"] = inbound.get(row["url"], 0)
        record["outbound_in_scope_links"] = outbound.get(row["url"], 0)
        rows.append(record)
    return rows


def export_manifest(state: CrawlState, directory: Path) -> tuple[Path, Path, int]:
    directory.mkdir(parents=True, exist_ok=True)
    rows = manifest_rows(state)
    jsonl_path = directory / "urls.jsonl"
    csv_path = directory / "urls.csv"
    with jsonl_path.open("w") as jsonl:
        for record in rows:
            jsonl.write(json.dumps(record, ensure_ascii=False) + "\n")
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for record in rows:
            writer.writerow(
                {**record, "discovered_via": " ".join(record["discovered_via"])}
            )
    return jsonl_path, csv_path, len(rows)
