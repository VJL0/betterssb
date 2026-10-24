"""Time the Bulletin API's queries against a populated database.

    uv run python -m scripts.bulletin_benchmark postgresql://…/db 2026-2027 [2024-2025]

Runs each production query (through `BulletinRepository`, the code the API
uses) once cold, i.e. on a new connection, then `RUNS` times warm, and prints
p50/p95/max in milliseconds with table and index sizes as JSON. The first run
on a new connection includes statement planning; the OS page cache can't be
dropped from here, so "cold" means a cold connection, not a cold disk.
"""

from __future__ import annotations

import asyncio
import json
import statistics
import sys
import time
from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import to_asyncpg_url
from app.modules.bulletin.repository import (
    BulletinRepository,
    CourseFilters,
    ProgramFilters,
)

RUNS = 50
PERCENTILE_95 = 0.95
SIZE_QUERY = """
SELECT c.relname, pg_total_relation_size(c.oid) AS total,
       pg_relation_size(c.oid) AS heap, pg_indexes_size(c.oid) AS indexes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'bulletin' AND c.relkind = 'r' ORDER BY total DESC
"""


async def program_id(session: AsyncSession, edition: str, name: str) -> int:
    programs = await BulletinRepository(session).search_programs(
        edition, ProgramFilters(query=name), 1, 0
    )
    return programs[0].id


def workload(
    edition: str, previous: str | None, cs_bs: int
) -> dict[str, Callable[[BulletinRepository], Awaitable[object]]]:
    queries: dict[str, Callable[[BulletinRepository], Awaitable[object]]] = {
        "course_by_code": lambda r: r.course(edition, "CIS", "2168"),
        "search_title_words": lambda r: r.search_courses(
            edition, CourseFilters(query="organic chemistry"), 25, 0
        ),
        "search_typo_trigram": lambda r: r.search_courses(
            edition, CourseFilters(query="Data Structres"), 25, 0
        ),
        "search_code_prefix": lambda r: r.search_courses(
            edition, CourseFilters(query="CIS 21"), 25, 0
        ),
        "filter_subject_credits": lambda r: r.search_courses(
            edition,
            CourseFilters(subject="MATH", min_credits=3, max_credits=4),
            100,
            0,
        ),
        "filter_attribute_level": lambda r: r.search_courses(
            edition, CourseFilters(attribute="WI", level="undergraduate"), 100, 0
        ),
        "majors_in_college": lambda r: r.search_programs(
            edition,
            ProgramFilters(credential="major", unit="undergraduate/science-technology"),
            100,
            0,
        ),
        "program_search": lambda r: r.search_programs(
            edition, ProgramFilters(query="computer science"), 25, 0
        ),
        "program_requirement_tree": lambda r: r.program(edition, cs_bs),
        "course_history": lambda r: r.course_history("CIS", "2168"),
        "program_history": lambda r: r.program_history(cs_bs),
        "policy_search": lambda r: r.policies(
            edition, "repeat course grade", None, 25, 0
        ),
    }
    if previous:

        async def compare(repository: BulletinRepository) -> object:
            return [
                await repository.program(edition, cs_bs),
                await repository.program(previous, cs_bs),
            ]

        queries["compare_program_editions"] = compare
    return queries


def summarize(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)
    return {
        "p50": round(statistics.median(ordered), 2),
        "p95": round(ordered[int(len(ordered) * PERCENTILE_95) - 1], 2),
        "max": round(ordered[-1], 2),
    }


async def timed(factory, query) -> float:
    async with factory() as session:
        started = time.perf_counter()
        await query(BulletinRepository(session))
        return (time.perf_counter() - started) * 1000


async def main(url: str, edition: str, previous: str | None) -> None:
    engine = create_async_engine(to_asyncpg_url(url), poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        cs_bs = await program_id(session, edition, "Computer Science BS")
    warm_engine = create_async_engine(to_asyncpg_url(url), pool_size=1)
    warm_factory = async_sessionmaker(warm_engine, expire_on_commit=False)
    results = {}
    for name, query in workload(edition, previous, cs_bs).items():
        cold = await timed(factory, query)
        warm = [await timed(warm_factory, query) for _ in range(RUNS)]
        results[name] = {"cold_ms": round(cold, 2), **summarize(warm)}
    async with factory() as session:
        sizes = {
            row.relname: {"total": row.total, "heap": row.heap, "indexes": row.indexes}
            for row in await session.execute(text(SIZE_QUERY))
        }
    await engine.dispose()
    await warm_engine.dispose()
    print(json.dumps({"runs": RUNS, "queries": results, "sizes": sizes}, indent=2))


if __name__ == "__main__":
    asyncio.run(
        main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    )
