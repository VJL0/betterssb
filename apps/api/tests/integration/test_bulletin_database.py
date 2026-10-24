"""The Bulletin pipeline against a real Postgres: interpret → import → publish
→ API, plus idempotency, edition isolation, rollback and atomicity.

Needs a disposable database: set `BULLETIN_TEST_DATABASE_URL` (e.g.
`postgresql://bulletin_test@127.0.0.1:55432/bulletin_it`, see
docs/bulletin/README.md). Each test gets an empty `bulletin` schema; the tests
skip when the variable is unset.
"""

from __future__ import annotations

import os
import shutil
from collections.abc import AsyncIterator
from decimal import Decimal
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import to_asyncpg_url
from app.main import app
from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.extract.courses import (
    CoursePart,
    CourseRecord,
    CreditHours,
)
from app.modules.bulletin.ingest.extract.run import CourseEntry
from app.modules.bulletin.ingest.interpret.run import interpret_edition
from app.modules.bulletin.ingest.load import (
    PublishRefused,
    import_edition,
    prune_batch,
    publish_batch,
)
from app.modules.bulletin.ingest.records import Evidence, Locator
from app.modules.bulletin.models import Base

DATABASE_URL = os.environ.get("BULLETIN_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="BULLETIN_TEST_DATABASE_URL is not set"
)

CATALOG_FIXTURES = (
    Path(__file__).parents[1] / "unit" / "bulletin" / "fixtures" / "catalog"
)
COURSES_URL = "https://bulletin.temple.edu/courses/cis/"
ARCHIVE_COURSES_URL = "https://bulletin.temple.edu/archives/2024-2025/courses/cis/"
CURRENT = "2026-2027"
ARCHIVE = "2024-2025"
# Real 2026-2027 CIS 2168 prerequisites.
CIS_2168_PREREQUISITES = (
    "Minimum grade of C- in (CIS 1068 or CIS 1968), (CIS 1166, CIS 1966, or MATH 2111), "
    "and (MATH 1022, any MATH course numbered 1038 to 4999 (may be taken concurrently), "
    "'Y' in MC6, 'Y' in MA04, 'Y' in MC6A, 'Y' in MATW, or 'Y' in MC6T)"
)


def evidence(url: str, index: int, text_: str) -> Evidence:
    return Evidence(
        url=url,
        sha256=f"{index:064x}",
        locator=Locator(xpath=f"/html/body/div[{index}]", line=index),
        text=text_,
    )


def course(url: str, number: str, title: str, prerequisites: str = "") -> CourseEntry:
    parts = []
    if prerequisites:
        parts.append(
            CoursePart(
                label="Pre-requisites",
                text=prerequisites,
                evidence=evidence(url, int(number), prerequisites),
            )
        )
    return CourseEntry(
        course=CourseRecord(
            subject="CIS",
            number=number,
            title=title,
            credits=CreditHours(text="4", minimum=Decimal(4), maximum=Decimal(4)),
            description=f"{title}: abstraction, algorithms and their analysis.",
            parts=parts,
            attributes=["WI"] if number == "4398" else [],
            referenced_courses=[],
            evidence=evidence(
                url, int(number), f"CIS {number}. {title}. 4 Credit Hours."
            ),
        ),
        also_listed_on=[],
        discrepancies=[],
    )


def write_extracts(root: Path, edition: str, url: str, data_structures: str) -> Path:
    directory = root / "extracted" / edition
    directory.mkdir(parents=True)
    for name in ("pages.jsonl", "programs.jsonl", "program_index.json"):
        shutil.copy(CATALOG_FIXTURES / name, directory / name)
    courses = [
        course(url, "1068", "Program Design and Abstraction"),
        course(url, "2168", data_structures, CIS_2168_PREREQUISITES),
        course(url, "4398", "Projects in Computer Science", "CIS 2168"),
    ]
    (directory / "courses.jsonl").write_text(
        "".join(entry.model_dump_json() + "\n" for entry in courses)
    )
    (directory / "issues.jsonl").write_text("")
    return directory


def interpret(root: Path, extracted: Path) -> Path:
    output = root / "interpreted" / extracted.name
    state = CrawlState(root / "crawl.sqlite3")
    try:
        interpret_edition(state, extracted, output)
    finally:
        state.close()
    return output


@pytest.fixture()
async def connection() -> AsyncIterator[asyncpg.Connection]:
    url = to_asyncpg_url(DATABASE_URL)
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as setup:
        await setup.execute(text("DROP SCHEMA IF EXISTS bulletin CASCADE"))
        await setup.execute(text("CREATE SCHEMA bulletin"))
        await setup.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await setup.run_sync(Base.metadata.create_all)
    await engine.dispose()
    raw = await asyncpg.connect(url.replace("postgresql+asyncpg://", "postgresql://"))
    try:
        yield raw
    finally:
        await raw.close()


@pytest.fixture()
def state(tmp_path: Path) -> CrawlState:
    crawl = CrawlState(tmp_path / "crawl.sqlite3")
    yield crawl
    crawl.close()


@pytest.fixture()
def api_database(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = create_async_engine(to_asyncpg_url(DATABASE_URL), poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(app.state, "session_factory", factory, raising=False)


async def published(connection, state, root: Path, edition: str, url: str, title: str):
    directory = interpret(root, write_extracts(root, edition, url, title))
    result = await import_edition(connection, state, directory)
    await publish_batch(connection, result.batch_id)
    return result


async def test_import_is_idempotent(connection, state, tmp_path: Path) -> None:
    directory = interpret(
        tmp_path, write_extracts(tmp_path, CURRENT, COURSES_URL, "Data Structures")
    )
    first = await import_edition(connection, state, directory)
    again = await import_edition(connection, state, directory)
    assert first.created and not again.created
    assert again.batch_id == first.batch_id
    assert await connection.fetchval("SELECT count(*) FROM bulletin.import_batch") == 1
    assert first.counts["course_version"] == 3
    assert first.counts["program_version"] > 0


async def test_staged_batch_is_invisible_until_published(
    connection, state, tmp_path: Path, client, api_database
) -> None:
    directory = interpret(
        tmp_path, write_extracts(tmp_path, CURRENT, COURSES_URL, "Data Structures")
    )
    result = await import_edition(connection, state, directory)
    response = await client.get(f"/api/bulletin/{CURRENT}/courses/CIS/2168")
    assert response.status_code == 404

    await publish_batch(connection, result.batch_id)
    response = await client.get(f"/api/bulletin/{CURRENT}/courses/CIS/2168")
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Data Structures"
    assert body["source"]["url"] == COURSES_URL
    prerequisite = body["requisites"][0]
    assert prerequisite["interpretation"] == "interpreted"
    assert prerequisite["expression"]["minGrade"] == "C-"
    assert body["requiredBy"] == ["CIS 4398"]


async def test_editions_stay_isolated(
    connection, state, tmp_path: Path, client, api_database
) -> None:
    await published(
        connection, state, tmp_path / "a", CURRENT, COURSES_URL, "Data Structures"
    )
    await published(
        connection,
        state,
        tmp_path / "b",
        ARCHIVE,
        ARCHIVE_COURSES_URL,
        "Data Structures I",
    )
    history = (await client.get("/api/bulletin/courses/CIS/2168/editions")).json()
    assert [(h["edition"], h["title"]) for h in history] == [
        (CURRENT, "Data Structures"),
        (ARCHIVE, "Data Structures I"),
    ]
    editions = (await client.get("/api/bulletin/editions")).json()
    assert [e["code"] for e in editions] == [CURRENT, ARCHIVE]
    shared = await connection.fetchval(
        """SELECT count(*) FROM bulletin.course_version a
        JOIN bulletin.course_version b ON a.id = b.id AND a.batch_id <> b.batch_id"""
    )
    assert shared == 0


async def test_publishing_an_older_batch_rolls_back(
    connection, state, tmp_path: Path
) -> None:
    old = await published(
        connection, state, tmp_path / "a", CURRENT, COURSES_URL, "Data Structures"
    )
    new = await published(
        connection,
        state,
        tmp_path / "b",
        CURRENT,
        COURSES_URL,
        "Data Structures and Algorithms",
    )
    assert new.batch_id != old.batch_id

    await publish_batch(connection, old.batch_id)
    current = await connection.fetchval("SELECT batch_id FROM bulletin.release")
    actions = await connection.fetch(
        "SELECT action, batch_id, previous_batch_id FROM bulletin.release_event ORDER BY id"
    )
    assert current == old.batch_id
    assert [tuple(row) for row in actions] == [
        ("publish", old.batch_id, None),
        ("publish", new.batch_id, old.batch_id),
        ("rollback", old.batch_id, new.batch_id),
    ]


async def test_prune_keeps_released_history(connection, state, tmp_path: Path) -> None:
    released = await published(
        connection, state, tmp_path / "a", CURRENT, COURSES_URL, "Data Structures"
    )
    staged = await import_edition(
        connection,
        state,
        interpret(
            tmp_path / "b",
            write_extracts(tmp_path / "b", CURRENT, COURSES_URL, "Draft"),
        ),
    )
    with pytest.raises(PublishRefused):
        await prune_batch(connection, released.batch_id)

    await prune_batch(connection, staged.batch_id)
    remaining = await connection.fetchval(
        "SELECT count(*) FROM bulletin.course_version WHERE batch_id = $1",
        staged.batch_id,
    )
    assert remaining == 0
    assert await connection.fetchval("SELECT count(*) FROM bulletin.course") >= 3


async def test_failed_import_leaves_nothing(connection, state, tmp_path: Path) -> None:
    directory = interpret(
        tmp_path, write_extracts(tmp_path, CURRENT, COURSES_URL, "Data Structures")
    )
    courses = directory / "courses.jsonl"
    courses.write_text(
        courses.read_text().replace('"number":"4398"', '"number":"43/98"')
    )
    with pytest.raises(ValueError, match="not course codes"):
        await import_edition(connection, state, directory)
    for table in ("import_batch", "course_version", "program_version", "edition"):
        assert await connection.fetchval(f"SELECT count(*) FROM bulletin.{table}") == 0


async def test_error_issues_block_publication(
    connection, state, tmp_path: Path
) -> None:
    directory = interpret(
        tmp_path, write_extracts(tmp_path, CURRENT, COURSES_URL, "Data Structures")
    )
    with (directory / "issues.jsonl").open("a") as issues:
        issues.write(
            '{"stage":"interpret","code":"requirement_without_source",'
            '"severity":"error","url":"https://bulletin.temple.edu/x/","detail":"t0"}\n'
        )
    result = await import_edition(connection, state, directory)
    with pytest.raises(PublishRefused, match="requirement_without_source"):
        await publish_batch(connection, result.batch_id)
    assert await connection.fetchval("SELECT count(*) FROM bulletin.release") == 0


async def test_search_and_program_queries(
    connection, state, tmp_path: Path, client, api_database
) -> None:
    await published(
        connection, state, tmp_path, CURRENT, COURSES_URL, "Data Structures"
    )
    by_words = (
        await client.get(
            f"/api/bulletin/{CURRENT}/courses", params={"q": "data structure"}
        )
    ).json()
    by_code = (
        await client.get(f"/api/bulletin/{CURRENT}/courses", params={"q": "cis2168"})
    ).json()
    by_typo = (
        await client.get(
            f"/api/bulletin/{CURRENT}/courses", params={"q": "Data Structres"}
        )
    ).json()
    assert by_words[0]["code"] == by_code[0]["code"] == by_typo[0]["code"] == "CIS 2168"

    programs = (
        await client.get(f"/api/bulletin/{CURRENT}/programs", params={"limit": 100})
    ).json()
    assert programs
    detail = (
        await client.get(f"/api/bulletin/{CURRENT}/programs/{programs[0]['id']}")
    ).json()
    assert detail["requirements"]["programUrl"] == detail["url"]
    root = (
        detail["requirements"]["roots"][0] if detail["requirements"]["roots"] else None
    )
    if root is not None:
        assert root["sources"]
    policies = (
        await client.get(f"/api/bulletin/{CURRENT}/policies", params={"limit": 5})
    ).json()
    assert all(section["sources"] for section in policies)
