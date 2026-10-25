from __future__ import annotations

from urllib.parse import urlsplit

import httpx
import pytest

from app.modules.degree.client import (
    BulletinClient,
    BulletinPageNotFound,
    BulletinUnavailable,
)
from app.modules.degree.program_index import bulletin_edition, parse_program_index
from app.modules.degree.schemas import ProgramLevel, SelectionType
from app.modules.degree.service import (
    CACHE_TTL_SECONDS,
    CURRENT_INDEX_PATH,
    FALLBACK_TTL_SECONDS,
    BulletinService,
)
from tests.conftest import FIXTURES_DIR
from tests.unit.test_class_search import MemoryCache

BASE_URL = "https://bulletin.temple.edu"
ARCHIVED_INDEX_HTML = (FIXTURES_DIR / "bulletin_programs_archived.html").read_text()
CURRENT_INDEX_HTML = (FIXTURES_DIR / "bulletin_programs_current.html").read_text()
PROGRAM_HTML = (FIXTURES_DIR / "bulletin_cs_bs.html").read_text()
COURSE_POPUP_XML = (FIXTURES_DIR / "bulletin_course_popup.xml").read_text()
SUBJECTS_HTML = (FIXTURES_DIR / "bulletin_course_subjects.html").read_text()
SUBJECT_COURSES_HTML = (FIXTURES_DIR / "bulletin_courses_cis.html").read_text()
COURSE_CODE = "CIS 3296"
POPUP_PATH = "/ribbit/index.cgi"

ARCHIVED_YEAR = bulletin_edition(ARCHIVED_INDEX_HTML)
CURRENT_YEAR = bulletin_edition(CURRENT_INDEX_HTML)
MISSING_YEAR = "1900-1901"
_ARCHIVED_START = int(ARCHIVED_YEAR.split("-")[0])
# The year after the archived one: not archived, and not the current edition either.
GAP_YEAR = f"{_ARCHIVED_START + 1}-{_ARCHIVED_START + 2}"
ARCHIVED_INDEX_PATH = f"/archives/{ARCHIVED_YEAR}/academic-programs/"
ARCHIVED_INDEX_URL = f"{BASE_URL}{ARCHIVED_INDEX_PATH}"
PROGRAM_URL = next(
    p.url
    for p in parse_program_index(ARCHIVED_INDEX_HTML, ARCHIVED_INDEX_URL).programs
    if p.name == "Computer Science" and p.degree == "BS"
)
PROGRAM_PATH = urlsplit(PROGRAM_URL).path
ARCHIVED_SUBJECTS_PATH = f"/archives/{ARCHIVED_YEAR}/courses/"
ARCHIVED_CIS_PATH = f"{ARCHIVED_SUBJECTS_PATH}cis/"


class FakeBulletin:
    """Records requests and serves saved Bulletin pages by path."""

    def __init__(self, pages: dict[str, httpx.Response] | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.pages = pages or {
            ARCHIVED_INDEX_PATH: httpx.Response(200, text=ARCHIVED_INDEX_HTML),
            CURRENT_INDEX_PATH: httpx.Response(200, text=CURRENT_INDEX_HTML),
            PROGRAM_PATH: httpx.Response(200, text=PROGRAM_HTML),
            f"/archives/{ARCHIVED_YEAR}{POPUP_PATH}": httpx.Response(
                200, text=COURSE_POPUP_XML
            ),
            POPUP_PATH: httpx.Response(200, text=COURSE_POPUP_XML),
            ARCHIVED_SUBJECTS_PATH: httpx.Response(200, text=SUBJECTS_HTML),
            ARCHIVED_CIS_PATH: httpx.Response(200, text=SUBJECT_COURSES_HTML),
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.pages.get(request.url.path, httpx.Response(404))

    def service(self, cache: MemoryCache | None = None) -> BulletinService:
        client = BulletinClient(BASE_URL, transport=httpx.MockTransport(self.handler))
        return BulletinService(client, cache)

    def paths(self) -> list[str]:
        return [r.url.path for r in self.requests]


class TestParseProgramIndex:
    @pytest.fixture()
    def programs(self):
        return parse_program_index(ARCHIVED_INDEX_HTML, ARCHIVED_INDEX_URL).programs

    def test_one_program_per_degree_link(self, programs):
        cs = [p for p in programs if p.name == "Computer Science"]
        assert [(p.degree, p.level) for p in cs] == [
            ("BA", ProgramLevel.UNDERGRADUATE),
            ("BS", ProgramLevel.UNDERGRADUATE),
            ("Minor", ProgramLevel.UNDERGRADUATE),
            ("MS", ProgramLevel.GRADUATE),
            ("Cert.", ProgramLevel.GRADUATE),
        ]

    def test_urls_are_absolute_bulletin_links(self, programs):
        cs_bs = next(p for p in programs if p.url == PROGRAM_URL)
        assert PROGRAM_URL.startswith(f"{BASE_URL}/archives/{ARCHIVED_YEAR}/")
        assert cs_bs.college == "ST"

    def test_keeps_concentration_anchors(self, programs):
        concentration = next(
            p
            for p in programs
            if p.name.startswith("Advertising") and p.degree == "Conc."
        )
        assert concentration.url.endswith("-ba/#optionalconcentrationtext")

    def test_drops_footnote_marks_from_names(self, programs):
        advertising = next(p for p in programs if p.name.startswith("Advertising"))
        assert advertising.name == (
            "Advertising (Account Management, International Communication)"
        )

    def test_splits_notes_from_degrees(self, programs):
        anthropology_ma = next(
            p for p in programs if p.name == "Anthropology" and p.degree == "MA"
        )
        assert anthropology_ma.note == "not currently accepting applications"

    @pytest.mark.parametrize(
        ("label", "degree", "note"),
        [
            ("BS", "BS", ""),
            ("BS*", "BS", ""),
            ("MS (thesis)*", "MS", "thesis"),
            (
                "MA* (not currently accepting applications)",
                "MA",
                "not currently accepting applications",
            ),
            ("Post-Master's Cert.", "Post-Master's Cert.", ""),
        ],
    )
    def test_degree_labels(self, label, degree, note):
        html = (
            '<table><tbody id="degree_body"><tr><td class="column0">X</td>'
            f'<td class="column1"><a href="/undergraduate/x/">{label}</a></td>'
            "</tr></tbody></table>"
        )
        [program] = parse_program_index(
            html, f"{BASE_URL}{CURRENT_INDEX_PATH}"
        ).programs
        assert (program.degree, program.note) == (degree, note)

    def test_skips_links_off_the_bulletin(self):
        html = (
            '<table><tbody id="degree_body"><tr><td class="column0">X</td>'
            '<td class="column1"><a href="https://example.com/x/">BS</a></td>'
            "</tr></tbody></table>"
        )
        assert (
            parse_program_index(html, f"{BASE_URL}{CURRENT_INDEX_PATH}").programs == []
        )


class TestPrograms:
    async def test_reads_an_archived_year(self):
        bulletin = FakeBulletin()
        index = await bulletin.service().programs(ARCHIVED_YEAR)
        assert index.bulletin_year == ARCHIVED_YEAR
        assert index.source_url == ARCHIVED_INDEX_URL
        assert any(p.url == PROGRAM_URL for p in index.programs)
        assert bulletin.paths() == [ARCHIVED_INDEX_PATH]

    async def test_reads_the_current_year_from_the_site_root(self):
        bulletin = FakeBulletin()
        index = await bulletin.service().programs(CURRENT_YEAR)
        assert index.source_url == f"{BASE_URL}{CURRENT_INDEX_PATH}"
        assert index.programs[0].url.startswith(f"{BASE_URL}/undergraduate/")
        assert bulletin.paths() == [
            f"/archives/{CURRENT_YEAR}/academic-programs/",
            CURRENT_INDEX_PATH,
        ]

    async def test_falls_back_to_the_previous_year_online(self):
        assert GAP_YEAR != CURRENT_YEAR
        index = await FakeBulletin().service().programs(GAP_YEAR)
        assert (index.requested_year, index.bulletin_year) == (GAP_YEAR, ARCHIVED_YEAR)
        assert index.source_url == ARCHIVED_INDEX_URL

    async def test_a_year_online_is_its_own_requested_year(self):
        index = await FakeBulletin().service().programs(ARCHIVED_YEAR)
        assert index.requested_year == index.bulletin_year == ARCHIVED_YEAR

    async def test_a_stand_in_year_is_rechecked_daily(self):
        cache = MemoryCache()
        await FakeBulletin().service(cache).programs(GAP_YEAR)
        stand_in = next(k for k in cache.ttls if k.endswith(f"programs-for:{GAP_YEAR}"))
        assert cache.ttls[stand_in] == FALLBACK_TTL_SECONDS

    async def test_a_year_that_isnt_online_is_not_found(self):
        with pytest.raises(BulletinPageNotFound):
            await FakeBulletin().service().programs(MISSING_YEAR)

    async def test_caches_the_index(self):
        bulletin, cache = FakeBulletin(), MemoryCache()
        first = await bulletin.service(cache).programs(ARCHIVED_YEAR)
        second = await bulletin.service(cache).programs(ARCHIVED_YEAR)
        assert second == first
        assert len(bulletin.requests) == 1
        assert set(cache.ttls.values()) == {CACHE_TTL_SECONDS}

    async def test_a_page_without_programs_is_an_outage_and_isnt_cached(self):
        cache = MemoryCache()
        bulletin = FakeBulletin(
            {ARCHIVED_INDEX_PATH: httpx.Response(200, text="<html></html>")}
        )
        with pytest.raises(BulletinUnavailable):
            await bulletin.service(cache).programs(ARCHIVED_YEAR)
        assert cache.values == {}

    async def test_server_errors_are_outages(self):
        bulletin = FakeBulletin({ARCHIVED_INDEX_PATH: httpx.Response(503)})
        with pytest.raises(BulletinUnavailable):
            await bulletin.service().programs(ARCHIVED_YEAR)


class TestRequirements:
    async def test_parses_a_program_page(self):
        program = await FakeBulletin().service().requirements(PROGRAM_URL)
        assert program.name == "Computer Science BS"
        assert program.bulletin_url == PROGRAM_URL
        assert program.program_code == "ST-CSCI-BS"

        major = next(c for c in program.categories if c.name.startswith("Major"))
        groups = {g.name: g for g in major.groups}
        first = groups["Computer & Information Science courses"].items[0]
        assert first.selection_type == SelectionType.REQUIRED
        assert [(c.subject, c.number) for c in first.options[0].courses] == [
            ("CIS", "1001")
        ]
        electives = groups["Computer Science Electives"].items[0]
        assert electives.selection_type == SelectionType.SELECT_N

    async def test_course_links_cite_the_bulletin(self):
        program = await FakeBulletin().service().requirements(PROGRAM_URL)
        refs = [
            ref
            for category in program.categories
            for group in category.groups
            for item in group.items
            for option in item.options
            for ref in option.courses
        ]
        assert refs
        assert all(ref.bulletin_url.startswith(BASE_URL) for ref in refs)

    async def test_fetches_the_page_without_its_anchor(self):
        bulletin = FakeBulletin()
        program = await bulletin.service().requirements(f"{PROGRAM_URL}#text")
        assert program.bulletin_url == PROGRAM_URL
        assert bulletin.paths() == [PROGRAM_PATH]

    async def test_caches_parsed_requirements(self):
        bulletin, cache = FakeBulletin(), MemoryCache()
        first = await bulletin.service(cache).requirements(PROGRAM_URL)
        second = await bulletin.service(cache).requirements(PROGRAM_URL)
        assert second == first
        assert len(bulletin.requests) == 1

    async def test_follows_redirects_on_the_bulletin(self):
        slashless = PROGRAM_PATH.rstrip("/")
        bulletin = FakeBulletin()
        bulletin.pages[slashless] = httpx.Response(
            301, headers={"Location": PROGRAM_URL}
        )
        program = await bulletin.service().requirements(f"{BASE_URL}{slashless}")
        assert program.name == "Computer Science BS"

    async def test_refuses_redirects_off_the_bulletin(self):
        bulletin = FakeBulletin(
            {
                PROGRAM_PATH: httpx.Response(
                    302, headers={"Location": "https://example.com/"}
                )
            }
        )
        with pytest.raises(BulletinUnavailable):
            await bulletin.service().requirements(PROGRAM_URL)
        assert [r.url.host for r in bulletin.requests] == ["bulletin.temple.edu"]


class TestCourse:
    async def test_reads_an_archived_years_course_popup(self):
        bulletin = FakeBulletin()
        course = await bulletin.service().course(COURSE_CODE, ARCHIVED_YEAR)
        assert (course.code, course.attributes) == (COURSE_CODE, ["WI"])
        assert course.bulletin_url == (
            f"{BASE_URL}/archives/{ARCHIVED_YEAR}/search/?P=CIS%203296"
        )
        popup = bulletin.requests[-1]
        assert popup.url.path == f"/archives/{ARCHIVED_YEAR}{POPUP_PATH}"
        assert popup.url.params["code"] == COURSE_CODE

    async def test_reads_the_current_years_popup_at_the_site_root(self):
        bulletin = FakeBulletin()
        course = await bulletin.service().course(COURSE_CODE, CURRENT_YEAR)
        assert course.bulletin_url == f"{BASE_URL}/search/?P=CIS%203296"
        assert bulletin.paths()[-1] == POPUP_PATH

    async def test_courses_come_from_the_stand_in_year(self):
        course = await FakeBulletin().service().course(COURSE_CODE, GAP_YEAR)
        assert course.bulletin_url.startswith(f"{BASE_URL}/archives/{ARCHIVED_YEAR}/")

    async def test_a_course_the_popup_doesnt_have_is_not_found(self):
        with pytest.raises(BulletinPageNotFound):
            await FakeBulletin().service().course("CIS 9999", ARCHIVED_YEAR)

    async def test_caches_the_course(self):
        bulletin, cache = FakeBulletin(), MemoryCache()
        first = await bulletin.service(cache).course(COURSE_CODE, ARCHIVED_YEAR)
        requests = len(bulletin.requests)
        second = await bulletin.service(cache).course(COURSE_CODE, ARCHIVED_YEAR)
        assert second == first
        assert len(bulletin.requests) == requests


class TestSubjects:
    async def test_lists_every_subject_by_code(self):
        index = await FakeBulletin().service().subjects(ARCHIVED_YEAR)
        subjects = {s.code: s.name for s in index.subjects}
        assert subjects["CIS"] == "Computer & Information Science"
        # A name with its own parentheses keeps them.
        assert subjects["ANAT"] == "Anatomy & Cell Biology (Medical School)"
        assert index.source_url == f"{BASE_URL}{ARCHIVED_SUBJECTS_PATH}"

    async def test_a_stand_in_year_says_which_year_it_is(self):
        cache = MemoryCache()
        index = await FakeBulletin().service(cache).subjects(GAP_YEAR)
        assert (index.bulletin_year, index.requested_year) == (ARCHIVED_YEAR, GAP_YEAR)
        key = next(k for k in cache.ttls if k.endswith(f"subjects:{GAP_YEAR}"))
        assert cache.ttls[key] == FALLBACK_TTL_SECONDS


class TestSubjectCourses:
    async def test_lists_the_subjects_courses_with_archive_links(self):
        result = await FakeBulletin().service().subject_courses("CIS", ARCHIVED_YEAR)
        courses = {c.code: c for c in result.courses}
        assert courses["CIS 3296"].title == "Software Design"
        assert all(c.code.startswith("CIS ") for c in result.courses)
        assert courses["CIS 3296"].bulletin_url == (
            f"{BASE_URL}/archives/{ARCHIVED_YEAR}/search/?P=CIS%203296"
        )

    async def test_an_unknown_subject_is_not_found(self):
        with pytest.raises(BulletinPageNotFound):
            await FakeBulletin().service().subject_courses("ZZZ", ARCHIVED_YEAR)

    async def test_caches_the_subject(self):
        bulletin, cache = FakeBulletin(), MemoryCache()
        first = await bulletin.service(cache).subject_courses("CIS", ARCHIVED_YEAR)
        requests = len(bulletin.requests)
        second = await bulletin.service(cache).subject_courses("CIS", ARCHIVED_YEAR)
        assert second == first
        assert len(bulletin.requests) == requests
