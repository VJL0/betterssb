from __future__ import annotations

import os
from pathlib import Path

# Point at an in-memory SQLite DB before any app imports touch the engine.
os.environ.setdefault(
    "DATABASE_URL",
    "sqlite+aiosqlite:///",
)

import pytest
from httpx import ASGITransport, AsyncClient

from app.domains.schedule.schemas import SchedulePreferences, Section
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture()
def bulletin_html() -> str:
    return (FIXTURES_DIR / "bulletin_cs_bs.html").read_text()


@pytest.fixture()
def bulletin_cybr_html() -> str:
    return (FIXTURES_DIR / "bulletin_cybr_bs.html").read_text()


@pytest.fixture()
def sample_sections() -> list[Section]:
    """Two courses, two sections each — no inherent conflicts."""
    return [
        Section(crn="10001", course_id="CIS1068", instructor="Smith", days="MWF", start_time="09:00", end_time="09:50"),
        Section(crn="10002", course_id="CIS1068", instructor="Jones", days="TR", start_time="11:00", end_time="12:15"),
        Section(crn="20001", course_id="MATH1041", instructor="Doe", days="MWF", start_time="10:00", end_time="10:50"),
        Section(crn="20002", course_id="MATH1041", instructor="Lee", days="TR", start_time="14:00", end_time="15:15"),
    ]


@pytest.fixture()
def conflicting_sections() -> list[Section]:
    """Two courses whose only sections overlap on MWF 09:00-09:50."""
    return [
        Section(crn="30001", course_id="CIS2168", instructor="Alpha", days="MWF", start_time="09:00", end_time="09:50"),
        Section(crn="40001", course_id="CIS2107", instructor="Beta", days="MWF", start_time="09:30", end_time="10:20"),
    ]


@pytest.fixture()
def default_prefs() -> SchedulePreferences:
    return SchedulePreferences()


@pytest.fixture()
def transcript_text() -> str:
    return (
        "CIS  1068 Program Design and Abstraction    A   4.00   Fall 2024\n"
        "MATH 1041 Calculus I                         B+  4.00   Fall 2024\n"
        "ENGL 0802 Analytical Reading and Writing     A-  3.00   Fall 2024\n"
        "PHYS 1061 General Physics I                  C   4.00   Spring 2025\n"
        "\n"
        "Overall GPA: 3.45\n"
    )
