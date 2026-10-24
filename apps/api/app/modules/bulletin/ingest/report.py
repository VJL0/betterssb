"""The coverage and quality report: what was discovered, fetched and excluded
(from the crawl state), and what each published edition holds (from Postgres).

Every number here is counted from stored data at report time; nothing is
estimated. References to courses an edition doesn't list are reported, not
treated as failures: requirements legitimately name discontinued courses.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

import asyncpg

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.models import SCHEMA


def crawl_coverage(state: CrawlState) -> dict[str, Any]:
    by_status: Counter[str] = Counter()
    by_edition: defaultdict[str, Counter[str]] = defaultdict(Counter)
    excluded_reasons: Counter[str] = Counter()
    failures = []
    for row in state.rows():
        key = f"{row['scope']}:{row['status']}"
        by_status[key] += 1
        if row["edition"]:
            by_edition[row["edition"]][f"{row['level']}:{row['status']}"] += 1
        if row["status"] == "excluded":
            excluded_reasons[row["reason"]] += 1
        elif row["status"] in {"failed", "blocked_robots", "pending"}:
            failures.append(
                {
                    "url": row["url"],
                    "status": row["status"],
                    "edition": row["edition"],
                    "error": row["error"],
                }
            )
    return {
        "urls_total": sum(by_status.values()),
        "by_scope_status": dict(sorted(by_status.items())),
        "by_edition": {
            e: dict(sorted(c.items())) for e, c in sorted(by_edition.items())
        },
        "excluded_reasons": dict(excluded_reasons.most_common()),
        "unresolved_urls": sorted(failures, key=lambda f: f["url"]),
    }


async def _grouped(
    connection: asyncpg.Connection, query: str, batch_id: int
) -> dict[str, int]:
    return {row[0]: row[1] for row in await connection.fetch(query, batch_id)}


async def edition_quality(
    connection: asyncpg.Connection, batch_id: int
) -> dict[str, Any]:
    s = SCHEMA
    counts = {
        name: await connection.fetchval(query, batch_id)
        for name, query in {
            "courses": f"SELECT count(*) FROM {s}.course_version WHERE batch_id = $1",
            "programs": f"SELECT count(*) FROM {s}.program_version WHERE batch_id = $1",
            "plans": f"""SELECT count(*) FROM {s}.academic_plan p
                JOIN {s}.program_version v ON v.id = p.program_version_id
                WHERE v.batch_id = $1""",
            "policy_sections": f"SELECT count(*) FROM {s}.policy_section WHERE batch_id = $1",
            "units": f"SELECT count(*) FROM {s}.academic_unit WHERE batch_id = $1",
            "designations": f"SELECT count(*) FROM {s}.course_designation WHERE batch_id = $1",
        }.items()
    }
    nodes = f"""FROM {s}.requirement_node n
        JOIN {s}.program_version v ON v.id = n.program_version_id WHERE v.batch_id = $1"""
    return {
        "counts": counts,
        "programs_by_level": await _grouped(
            connection,
            f"""SELECT level, count(*) FROM {s}.program_version
            WHERE batch_id = $1 GROUP BY 1 ORDER BY 1""",
            batch_id,
        ),
        "programs_by_credential": await _grouped(
            connection,
            f"""SELECT credential, count(*) FROM {s}.program_version
            WHERE batch_id = $1 GROUP BY 1 ORDER BY 2 DESC""",
            batch_id,
        ),
        "requirement_nodes_by_kind": await _grouped(
            connection,
            f"SELECT n.kind, count(*) {nodes} GROUP BY 1 ORDER BY 1",
            batch_id,
        ),
        "requirement_nodes_by_interpretation": await _grouped(
            connection,
            f"SELECT n.interpretation, count(*) {nodes} GROUP BY 1 ORDER BY 1",
            batch_id,
        ),
        "requirement_nodes_by_validation": await _grouped(
            connection,
            f"SELECT n.validation, count(*) {nodes} GROUP BY 1 ORDER BY 1",
            batch_id,
        ),
        "requisites_by_interpretation": await _grouped(
            connection,
            f"""SELECT r.kind || ':' || r.interpretation, count(*)
            FROM {s}.course_requisite r
            JOIN {s}.course_version v ON v.id = r.course_version_id
            WHERE v.batch_id = $1 GROUP BY 1 ORDER BY 1""",
            batch_id,
        ),
        "requirement_courses_not_listed": await connection.fetchval(
            f"""SELECT count(DISTINCT n.course_id) {nodes} AND n.course_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM {s}.course_version c
                WHERE c.batch_id = v.batch_id AND c.course_id = n.course_id)""",
            batch_id,
        ),
        "requisite_courses_not_listed": await connection.fetchval(
            f"""SELECT count(DISTINCT r.referenced_course_id)
            FROM {s}.course_reference r
            JOIN {s}.course_version v ON v.id = r.course_version_id
            WHERE v.batch_id = $1 AND r.relation <> 'mentioned'
            AND NOT EXISTS (SELECT 1 FROM {s}.course_version c
                WHERE c.batch_id = v.batch_id AND c.course_id = r.referenced_course_id)""",
            batch_id,
        ),
        "issues": await _grouped(
            connection,
            f"""SELECT severity || ':' || stage || ':' || code, count(*)
            FROM {s}.quality_issue WHERE batch_id = $1 GROUP BY 1 ORDER BY 1""",
            batch_id,
        ),
    }


async def build_report(
    connection: asyncpg.Connection, state: CrawlState
) -> dict[str, Any]:
    releases = await connection.fetch(
        f"""SELECT e.code, r.batch_id, r.published_at, b.fingerprint,
            b.extractor_version, b.interpreter_version, b.rules_version
        FROM {SCHEMA}.release r
        JOIN {SCHEMA}.edition e ON e.id = r.edition_id
        JOIN {SCHEMA}.import_batch b ON b.id = r.batch_id
        ORDER BY e.start_year DESC"""
    )
    editions = {}
    for release in releases:
        editions[release["code"]] = {
            "batch": release["batch_id"],
            "published_at": release["published_at"].isoformat(),
            "fingerprint": release["fingerprint"],
            "versions": {
                "extractor": release["extractor_version"],
                "interpreter": release["interpreter_version"],
                "rules": release["rules_version"],
            },
            **await edition_quality(connection, release["batch_id"]),
        }
    return {
        "academic_validation": "not_asserted",
        "crawl": crawl_coverage(state),
        "published_editions": editions,
    }
