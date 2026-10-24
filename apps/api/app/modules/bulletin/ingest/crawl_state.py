"""The crawl's working state: every URL seen, every link between them, every
HTTP attempt, and each host's robots.txt.

It's a SQLite file (stdlib, one writer) so an interrupted crawl resumes where
it stopped and the URL manifest can be exported from it at any point. It is
working state for the offline ingester, not the catalog database.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.modules.bulletin.ingest.urls import UrlInfo


class UrlStatus:
    PENDING = "pending"
    FETCHED = "fetched"
    # A conditional request said the stored snapshot is still current.
    NOT_MODIFIED = "not_modified"
    FAILED = "failed"
    # Bytes from an earlier capture or a hand download, not fetched by the crawler.
    IMPORTED = "imported"
    # Out of scope by the catalog's structure (see urls.classify_url).
    EXCLUDED = "excluded"
    BLOCKED_BY_ROBOTS = "blocked_robots"


SCHEMA = """
CREATE TABLE IF NOT EXISTS urls (
    url TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    edition TEXT,
    level TEXT,
    eligible INTEGER NOT NULL,
    reason TEXT NOT NULL,
    discovered_via TEXT NOT NULL DEFAULT '[]',
    first_source_url TEXT,
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    http_status INTEGER,
    final_url TEXT,
    redirect_chain TEXT,
    content_type TEXT,
    sha256 TEXT,
    bytes INTEGER,
    etag TEXT,
    last_modified TEXT,
    fetched_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    canonical_url TEXT,
    title TEXT,
    page_kind TEXT,
    duplicate_of TEXT,
    extraction_status TEXT,
    extraction_detail TEXT
);
CREATE INDEX IF NOT EXISTS urls_status ON urls (status, eligible);
CREATE INDEX IF NOT EXISTS urls_sha256 ON urls (sha256);
CREATE TABLE IF NOT EXISTS links (
    from_url TEXT NOT NULL,
    to_url TEXT NOT NULL,
    method TEXT NOT NULL,
    anchor_text TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (from_url, to_url, method)
);
CREATE INDEX IF NOT EXISTS links_to ON links (to_url);
CREATE TABLE IF NOT EXISTS fetches (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    conditional INTEGER NOT NULL,
    http_status INTEGER,
    final_url TEXT,
    sha256 TEXT,
    elapsed_ms INTEGER,
    error TEXT
);
CREATE TABLE IF NOT EXISTS robots (
    host TEXT PRIMARY KEY,
    status INTEGER,
    body TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True, slots=True)
class FetchRecord:
    status: str
    http_status: int | None
    final_url: str | None
    redirect_chain: list[str]
    content_type: str | None
    sha256: str | None
    size: int | None
    etag: str | None
    last_modified: str | None
    error: str | None
    fetched_at: str


class CrawlState:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)

    def close(self) -> None:
        self.db.commit()
        self.db.close()

    def commit(self) -> None:
        self.db.commit()

    # ── URLs ────────────────────────────────────────────────────────────────

    def record_url(
        self,
        info: UrlInfo,
        method: str,
        source_url: str | None = None,
        depth: int = 0,
    ) -> bool:
        """Record a sighting of a URL; True if it was new.

        A URL keeps its first source and shallowest depth; every method that
        found it is kept, which is what reconciling discovery methods needs.
        """
        row = self.db.execute(
            "SELECT discovered_via, depth FROM urls WHERE url = ?", (info.url,)
        ).fetchone()
        if row is None:
            status = UrlStatus.PENDING if info.eligible else UrlStatus.EXCLUDED
            self.db.execute(
                """INSERT INTO urls (url, scope, edition, level, eligible, reason,
                discovered_via, first_source_url, depth, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    info.url,
                    info.scope,
                    info.edition,
                    info.level,
                    int(info.eligible),
                    info.reason,
                    json.dumps([method]),
                    source_url,
                    depth,
                    status,
                ),
            )
            return True
        methods = json.loads(row["discovered_via"])
        if method not in methods:
            methods.append(method)
            self.db.execute(
                "UPDATE urls SET discovered_via = ? WHERE url = ?",
                (json.dumps(methods), info.url),
            )
        if depth < row["depth"]:
            self.db.execute(
                "UPDATE urls SET depth = ? WHERE url = ?", (depth, info.url)
            )
        return False

    def record_link(
        self, from_url: str, to_url: str, method: str, anchor_text: str
    ) -> None:
        self.db.execute(
            """INSERT OR IGNORE INTO links (from_url, to_url, method, anchor_text)
            VALUES (?, ?, ?, ?)""",
            (from_url, to_url, method, anchor_text[:300]),
        )

    def pending(self, hosts: Iterable[str] | None = None) -> list[sqlite3.Row]:
        rows = self.db.execute(
            """SELECT url, depth, etag, last_modified FROM urls
            WHERE status = ? AND eligible = 1 ORDER BY depth, url""",
            (UrlStatus.PENDING,),
        ).fetchall()
        if hosts is None:
            return rows
        wanted = tuple(f"https://{host}/" for host in hosts)
        return [row for row in rows if row["url"].startswith(wanted)]

    def requeue_fetched(self, url_prefix: str = "") -> int:
        """Mark fetched URLs pending again, for a conditional re-crawl."""
        cursor = self.db.execute(
            """UPDATE urls SET status = ? WHERE status IN (?, ?) AND eligible = 1
            AND url LIKE ?""",
            (
                UrlStatus.PENDING,
                UrlStatus.FETCHED,
                UrlStatus.NOT_MODIFIED,
                f"{url_prefix}%",
            ),
        )
        return cursor.rowcount

    def reclassify(self, classify: Callable[[str], UrlInfo]) -> int:
        """Re-apply the scope rules to every URL after they change.

        A newly eligible URL that was never fetched becomes pending; a newly
        ineligible one that was never fetched becomes excluded. Fetched and
        imported snapshots keep their status.
        """
        changed = 0
        rows = self.db.execute("SELECT url, eligible, reason, status FROM urls")
        for row in rows.fetchall():
            info = classify(row["url"])
            status = row["status"]
            if status in {UrlStatus.PENDING, UrlStatus.EXCLUDED}:
                status = UrlStatus.PENDING if info.eligible else UrlStatus.EXCLUDED
            current = (row["eligible"], row["reason"], row["status"])
            if (int(info.eligible), info.reason, status) == current:
                continue
            self.db.execute(
                """UPDATE urls SET scope = ?, edition = ?, level = ?, eligible = ?,
                reason = ?, status = ? WHERE url = ?""",
                (
                    info.scope,
                    info.edition,
                    info.level,
                    int(info.eligible),
                    info.reason,
                    status,
                    row["url"],
                ),
            )
            changed += 1
        self.db.commit()
        return changed

    def get(self, url: str) -> sqlite3.Row | None:
        return self.db.execute("SELECT * FROM urls WHERE url = ?", (url,)).fetchone()

    def mark_blocked(self, url: str, reason: str) -> None:
        self.db.execute(
            "UPDATE urls SET status = ?, error = ? WHERE url = ?",
            (UrlStatus.BLOCKED_BY_ROBOTS, reason, url),
        )

    def record_fetch(self, url: str, record: FetchRecord) -> None:
        self.db.execute(
            """UPDATE urls SET status = ?, http_status = ?, final_url = ?,
            redirect_chain = ?, content_type = COALESCE(?, content_type),
            sha256 = COALESCE(?, sha256), bytes = COALESCE(?, bytes),
            etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified),
            error = ?, fetched_at = ?, attempts = attempts + 1
            WHERE url = ?""",
            (
                record.status,
                record.http_status,
                record.final_url,
                json.dumps(record.redirect_chain) if record.redirect_chain else None,
                record.content_type,
                record.sha256,
                record.size,
                record.etag,
                record.last_modified,
                record.error,
                record.fetched_at,
                url,
            ),
        )

    def set_page_facts(
        self, url: str, title: str | None, canonical_url: str | None
    ) -> None:
        self.db.execute(
            "UPDATE urls SET title = ?, canonical_url = ? WHERE url = ?",
            (title, canonical_url, url),
        )

    def set_extraction(
        self, url: str, page_kind: str, status: str, detail: str = ""
    ) -> None:
        self.db.execute(
            """UPDATE urls SET page_kind = ?, extraction_status = ?,
            extraction_detail = ? WHERE url = ?""",
            (page_kind, status, detail, url),
        )

    def set_duplicate(self, url: str, duplicate_of: str | None) -> None:
        self.db.execute(
            "UPDATE urls SET duplicate_of = ? WHERE url = ?", (duplicate_of, url)
        )

    def log_attempt(
        self,
        url: str,
        conditional: bool,
        http_status: int | None,
        final_url: str | None,
        sha256: str | None,
        elapsed_ms: int,
        error: str | None,
    ) -> None:
        self.db.execute(
            """INSERT INTO fetches (url, requested_at, conditional, http_status,
            final_url, sha256, elapsed_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                url,
                utc_now(),
                int(conditional),
                http_status,
                final_url,
                sha256,
                elapsed_ms,
                error,
            ),
        )

    # ── robots.txt ─────────────────────────────────────────────────────────

    def save_robots(self, host: str, status: int | None, body: str) -> None:
        self.db.execute(
            """INSERT INTO robots (host, status, body, fetched_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (host) DO UPDATE SET status = excluded.status,
            body = excluded.body, fetched_at = excluded.fetched_at""",
            (host, status, body, utc_now()),
        )

    # ── Reading ────────────────────────────────────────────────────────────

    def rows(self) -> Iterator[sqlite3.Row]:
        yield from self.db.execute("SELECT * FROM urls ORDER BY url")

    def fetched(self, edition: str | None = None) -> list[sqlite3.Row]:
        query = "SELECT * FROM urls WHERE sha256 IS NOT NULL AND http_status = 200"
        params: tuple[str, ...] = ()
        if edition:
            query += " AND edition = ?"
            params = (edition,)
        return self.db.execute(query + " ORDER BY url", params).fetchall()

    def inbound(self, url: str) -> list[sqlite3.Row]:
        return self.db.execute(
            "SELECT from_url, method, anchor_text FROM links WHERE to_url = ?",
            (url,),
        ).fetchall()

    def counts(self) -> dict[str, int]:
        return {
            f"{row['scope']}:{row['status']}": row["n"]
            for row in self.db.execute(
                "SELECT scope, status, count(*) AS n FROM urls GROUP BY 1, 2"
            )
        }
