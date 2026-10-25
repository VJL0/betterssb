from __future__ import annotations

from urllib.parse import quote, urldefrag, urlsplit

from app.core.cache import ONE_DAY_SECONDS, Cache, cache_get, cache_set
from app.modules.degree.bulletin_html import BULLETIN_BASE
from app.modules.degree.client import (
    BulletinClient,
    BulletinPageNotFound,
    BulletinUnavailable,
)
from app.modules.degree.course_descriptions import parse_course_blocks
from app.modules.degree.parser import BulletinParser
from app.modules.degree.program_index import bulletin_edition, parse_program_index
from app.modules.degree.schemas import (
    BulletinProgramIndex,
    BulletinSubjectIndex,
    CourseDescription,
    DegreeProgram,
    SubjectCourses,
)
from app.modules.degree.subject_index import parse_subject_index

# Archived Bulletins never change and the current one changes a few times a year.
CACHE_TTL_SECONDS = 7 * ONE_DAY_SECONDS
# A stand-in year is rechecked daily, so a newly published Bulletin replaces it soon.
FALLBACK_TTL_SECONDS = ONE_DAY_SECONDS
# How many earlier years to try when a year's Bulletin isn't online.
MAX_FALLBACK_YEARS = 3
# Bump the version when the parsers' output changes, so older results are refetched.
CACHE_PREFIX = "degree:v2:"
CURRENT_INDEX_PATH = "/academic-programs/"
# CourseLeaf's course popup, which returns the course's description block as XML.
COURSE_POPUP_PATH = "ribbit/index.cgi?page=getcourse.rjs&code="
# The course descriptions index, and one subject's page under it ("/courses/cis/").
COURSES_PATH = "/courses/"


def _cache_ttl(bulletin_year: str, requested_year: str) -> int:
    """How long to keep a result read from `bulletin_year` when `requested_year` was asked for."""
    return (
        CACHE_TTL_SECONDS if bulletin_year == requested_year else FALLBACK_TTL_SECONDS
    )


def _course_url(prefix: str, code: str) -> str:
    return f"{BULLETIN_BASE}{prefix}/search/?P={quote(code)}"


def archive_prefix(index: BulletinProgramIndex) -> str:
    """The path prefix for a Bulletin year's pages: "/archives/YYYY-YYYY" for past years, "" for the current one."""
    return (
        ""
        if index.source_url.endswith(f"{BULLETIN_BASE}{CURRENT_INDEX_PATH}")
        else f"/archives/{index.bulletin_year}"
    )


class BulletinService:
    """Program lists and requirements read from the Bulletin, cached so repeat lookups stay local."""

    def __init__(self, client: BulletinClient, cache: Cache | None) -> None:
        self._client = client
        self._cache = cache
        self._parser = BulletinParser()

    async def programs(self, year: str) -> BulletinProgramIndex:
        """Every program in one year's ("YYYY-YYYY") Bulletin, or the closest earlier year online.

        Temple doesn't publish every year's Bulletin (2025-2026 was never
        archived), and the year before is the safer stand-in: courses a
        student's own year added are missing, but nothing listed is wrong.
        Raises BulletinPageNotFound when neither the year nor the few before it are online.
        """
        key = f"{CACHE_PREFIX}programs-for:{year}"
        if cached := await cache_get(self._cache, key):
            return BulletinProgramIndex.model_validate_json(cached)
        first = int(year.split("-")[0])
        for start in range(first, first - MAX_FALLBACK_YEARS - 1, -1):
            try:
                index = await self._year_programs(f"{start}-{start + 1}")
            except BulletinPageNotFound:
                continue
            index.requested_year = year
            ttl = _cache_ttl(index.bulletin_year, year)
            await cache_set(self._cache, key, index.model_dump_json(), ttl)
            return index
        raise BulletinPageNotFound(year)

    async def _year_programs(self, year: str) -> BulletinProgramIndex:
        key = f"{CACHE_PREFIX}programs:{year}"
        if cached := await cache_get(self._cache, key):
            return BulletinProgramIndex.model_validate_json(cached)
        # Past years live under /archives/; the current year is only at the site root.
        path = f"/archives/{year}/academic-programs/"
        try:
            html = await self._client.get_page(path)
        except BulletinPageNotFound:
            path = CURRENT_INDEX_PATH
            html = await self._client.get_page(path)
            if bulletin_edition(html) != year:
                raise
        source_url = f"{BULLETIN_BASE}{path}"
        index = parse_program_index(html, source_url, year)
        if not index.programs:
            raise BulletinUnavailable(f"No programs found at {source_url}")
        await cache_set(self._cache, key, index.model_dump_json(), CACHE_TTL_SECONDS)
        return index

    async def requirements(self, url: str) -> DegreeProgram:
        """A program page's requirements. Only the URL's path is fetched, from the Bulletin's host."""
        page_url = urldefrag(url).url
        path = urlsplit(page_url).path
        key = f"{CACHE_PREFIX}requirements:{path}"
        if cached := await cache_get(self._cache, key):
            return DegreeProgram.model_validate_json(cached)
        program = self._parser.parse(await self._client.get_page(path), url=page_url)
        await cache_set(self._cache, key, program.model_dump_json(), CACHE_TTL_SECONDS)
        return program

    async def course(self, code: str, year: str) -> CourseDescription:
        """A course's description from one year's Bulletin.

        Raises BulletinPageNotFound when that year isn't online or has no such course.
        """
        key = f"{CACHE_PREFIX}course:{year}:{code}"
        if cached := await cache_get(self._cache, key):
            return CourseDescription.model_validate_json(cached)
        prefix = archive_prefix(await self.programs(year))
        page = await self._client.get_page(f"{prefix}/{COURSE_POPUP_PATH}{quote(code)}")
        course = next((c for c in parse_course_blocks(page) if c.code == code), None)
        if course is None:
            raise BulletinPageNotFound(code)
        course.bulletin_url = _course_url(prefix, code)
        await cache_set(self._cache, key, course.model_dump_json(), CACHE_TTL_SECONDS)
        return course

    async def subjects(self, year: str) -> BulletinSubjectIndex:
        """Every course subject in one year's Bulletin, or the year standing in for it."""
        key = f"{CACHE_PREFIX}subjects:{year}"
        if cached := await cache_get(self._cache, key):
            return BulletinSubjectIndex.model_validate_json(cached)
        programs = await self.programs(year)
        path = f"{archive_prefix(programs)}{COURSES_PATH}"
        subjects = parse_subject_index(await self._client.get_page(path))
        if not subjects:
            raise BulletinUnavailable(f"No subjects found at {path}")
        index = BulletinSubjectIndex(
            bulletin_year=programs.bulletin_year,
            requested_year=year,
            source_url=f"{BULLETIN_BASE}{path}",
            subjects=subjects,
        )
        ttl = _cache_ttl(programs.bulletin_year, year)
        await cache_set(self._cache, key, index.model_dump_json(), ttl)
        return index

    async def subject_courses(self, subject: str, year: str) -> SubjectCourses:
        """Every course a subject ("CIS") lists in one year's Bulletin.

        Raises BulletinPageNotFound when that year isn't online or has no such subject.
        """
        key = f"{CACHE_PREFIX}subject-courses:{year}:{subject}"
        if cached := await cache_get(self._cache, key):
            return SubjectCourses.model_validate_json(cached)
        programs = await self.programs(year)
        prefix = archive_prefix(programs)
        path = f"{prefix}{COURSES_PATH}{subject.lower()}/"
        courses = [
            c
            for c in parse_course_blocks(await self._client.get_page(path))
            # A subject's page can cross-list another subject's course.
            if c.code.split(" ")[0] == subject
        ]
        for course in courses:
            course.bulletin_url = _course_url(prefix, course.code)
        result = SubjectCourses(
            bulletin_year=programs.bulletin_year,
            subject=subject,
            source_url=f"{BULLETIN_BASE}{path}",
            courses=courses,
        )
        ttl = _cache_ttl(programs.bulletin_year, year)
        await cache_set(self._cache, key, result.model_dump_json(), ttl)
        return result
