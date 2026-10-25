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
    CourseDescription,
    DegreeProgram,
)

# Archived Bulletins never change and the current one changes a few times a year.
CACHE_TTL_SECONDS = 7 * ONE_DAY_SECONDS
# Bump the version when the parsers' output changes, so older results are refetched.
CACHE_PREFIX = "degree:v2:"
CURRENT_INDEX_PATH = "/academic-programs/"
# CourseLeaf's course popup, which returns the course's description block as XML.
COURSE_POPUP_PATH = "ribbit/index.cgi?page=getcourse.rjs&code="


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
        """Every program in one year's ("YYYY-YYYY") Bulletin.

        Raises BulletinPageNotFound when that year isn't online.
        """
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
        course.bulletin_url = f"{BULLETIN_BASE}{prefix}/search/?P={quote(code)}"
        await cache_set(self._cache, key, course.model_dump_json(), CACHE_TTL_SECONDS)
        return course
