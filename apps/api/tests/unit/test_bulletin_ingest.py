from __future__ import annotations

from decimal import Decimal

import httpx
import pytest

from app.modules.bulletin.editions import academic_year_start, edition_root
from app.modules.bulletin.ingest.capture import CaptureWriter, read_capture
from app.modules.bulletin.ingest.courses import parse_subject_page
from app.modules.bulletin.ingest.crawler import (
    ROBOTS_URL,
    SITEMAP_URL,
    Crawler,
    RobotsUnavailableError,
    is_in_scope,
    sitemap_urls,
)
from app.modules.bulletin.ingest.pages import (
    classify_page,
    edition_path,
    parse_gened_page,
    policy_from_text,
)
from app.modules.bulletin.ingest.pipeline import _program_slugs, edition_responses
from app.modules.bulletin.ingest.prerequisites import parse_prerequisites
from app.modules.bulletin.ingest.programs import (
    parse_program_index,
    parse_program_page,
)
from app.modules.bulletin.models import (
    PageKind,
    ParseStatus,
    ProgramKind,
    RuleNodeType,
)

ORIGIN = "https://bulletin.temple.edu"


def _types(node):
    return [child.node_type for child in node.children]


def _codes(node):
    return [child.label for child in node.children]


# ── Prerequisites ────────────────────────────────────────────────────────────


class TestPrerequisites:
    def test_single_course_takes_the_default_grade(self):
        tree = parse_prerequisites("Minimum grade of C- in CIS 2168 .")
        assert tree.node_type is RuleNodeType.COURSE
        assert tree.course == ("CIS", "2168")
        assert tree.params == {"min_grade": "C-"}
        assert tree.tree_status() is ParseStatus.COMPLETE

    def test_last_conjunction_applies_to_the_whole_list(self):
        tree = parse_prerequisites(
            "Minimum grade of C- in ( CHEM 2202 , CHEM 2212 , or CHEM 2922 )"
        )
        assert tree.node_type is RuleNodeType.ANY
        assert _codes(tree) == ["CHEM 2202", "CHEM 2212", "CHEM 2922"]

    def test_parenthesized_groups_nest(self):
        tree = parse_prerequisites(
            "Minimum grade of C- in ( ECON 1102 or ECON 1902 ) and "
            "( ECON 1101 , MATH 1042 , or 'Y' in MATW)"
        )
        assert tree.node_type is RuleNodeType.ALL
        assert _types(tree) == [RuleNodeType.ANY, RuleNodeType.ANY]
        test = tree.children[1].children[-1]
        assert test.node_type is RuleNodeType.TEST
        assert test.params == {"test": "MATW", "score": "Y"}

    def test_item_modifiers_override_the_grade_and_allow_concurrency(self):
        tree = parse_prerequisites(
            "Minimum grade of C- (except where noted) in ( MATH 1041 "
            "(C or higher; may be taken concurrently) or STAT 1102 )"
        )
        first, second = tree.children
        assert first.params == {"concurrent": True, "min_grade": "C"}
        assert second.params == {"min_grade": "C-"}

    def test_course_ranges_and_levels(self):
        tree = parse_prerequisites(
            "Minimum grade of C in (any MATH course numbered 0800 to 4999 "
            "(may be taken concurrently) or any 2000-level PSY course)"
        )
        numbered, level = tree.children
        assert numbered.node_type is RuleNodeType.COURSE_RANGE
        assert numbered.params["low"] == "0800" and numbered.params["concurrent"]
        assert (level.params["subject"], level.params["low"], level.params["high"]) == (
            "PSY",
            "2000",
            "2999",
        )

    def test_quoted_attribute(self):
        tree = parse_prerequisites(
            'Minimum grade of C- in any course with attribute "QA"'
        )
        assert tree.node_type is RuleNodeType.ATTRIBUTE
        assert tree.attribute == "QA"

    def test_complete_n_of_the_following_takes_the_rest_of_the_list(self):
        tree = parse_prerequisites(
            "Minimum grade of C in ( ADV 1101 or 'Y' in CRAD02), and Complete 2 of "
            "the following: ( ADV 2111 or 'Y' in CRAD07), ADV 2121 , and ADV 2131"
        )
        assert tree.node_type is RuleNodeType.ALL
        choose = tree.children[1]
        assert choose.node_type is RuleNodeType.COUNT
        assert choose.min_count == 2
        assert len(choose.children) == 3

    def test_mixed_conjunctions_without_parentheses_stay_text(self):
        tree = parse_prerequisites("CIS 1068 and CIS 1166 or CIS 2168")
        assert tree.node_type is RuleNodeType.TEXT
        assert tree.tree_status() is ParseStatus.RAW

    def test_bare_comma_list_is_all_but_partial(self):
        tree = parse_prerequisites("MGRE 3196 , SPED 3187 .")
        assert tree.node_type is RuleNodeType.ALL
        assert tree.params["implicit_conjunction"]
        assert tree.tree_status() is ParseStatus.PARTIAL

    def test_unrecognized_condition_keeps_its_wording(self):
        tree = parse_prerequisites(
            "Minimum grade of C in ARTE 3096 and minimum GPA of 3 in: courses "
            "numbered 0700 to 4999."
        )
        assert _types(tree) == [RuleNodeType.COURSE, RuleNodeType.TEXT]
        assert tree.children[1].source_text.startswith("minimum GPA of 3")
        assert tree.tree_status() is ParseStatus.PARTIAL


# ── Course pages ─────────────────────────────────────────────────────────────

SUBJECT_PAGE = """
<html><body>
<h1 class="page-title">Computer &amp; Information Science (CIS)</h1>
<div class="courseblock">
  <p class="courseblocktitle"><strong>CIS 0823.  Math for a Digital World.  1 to 4
  Credit Hours.</strong></p>
  <div class="courseblockdesc">
    <div class="courseblockheaddiv">Becoming an informed user of numbers.
      <p>NOTE: Duplicate Course: Students cannot receive credit for
      <a class="bubblelink code" href="/search/?P=CIS%200823">CIS 0823</a> if they have
      completed <a class="bubblelink code" href="/search/?P=MATH%200823">MATH 0823</a>.
      See also CIS 1001.</p>
    </div>
    <p class="courseblockpart"><strong>Course Attributes:</strong> GQ, HO</p>
    <p class="courseblockpart"><strong>Field of Study Restrictions:</strong> Must be
      enrolled in one of the following Majors: Computer Science, Data Science.<br>
      <strong>Class Restrictions:</strong> May not be enrolled in one of the following
      Classes: Freshman 0 to 29 Credits.</p>
    <p class="courseblockpart"><strong>Repeatability:</strong> This course may not be
      repeated for additional credits.</p>
    <p class="courseblockpart"><strong>Pre-requisites:</strong> Minimum grade of C- in
      (MATH 0702 or 'Y' in MC3)</p>
  </div>
</div>
<div class="courseblock">
  <p class="courseblocktitle"><strong>CIS 1033. Computing in MATLAB. 1.5 Credit
  Hour.</strong></p>
</div>
<div class="courseblock">
  <p class="courseblocktitle"><strong>Not a course heading</strong></p>
</div>
</body></html>
"""


class TestSubjectPage:
    @pytest.fixture()
    def page(self):
        return parse_subject_page(SUBJECT_PAGE)

    def test_subject(self, page):
        assert (page.code, page.name) == ("CIS", "Computer & Information Science")

    def test_heading_fields(self, page):
        course = page.courses[0]
        assert (course.code, course.title) == ("CIS 0823", "Math for a Digital World")
        assert (course.credits_min, course.credits_max) == (Decimal(1), Decimal(4))
        assert page.courses[1].credits_min == Decimal("1.5")

    def test_unmatched_headings_are_reported(self, page):
        assert page.unparsed_titles == ["Not a course heading"]

    def test_each_label_in_a_paragraph_is_its_own_part(self, page):
        restrictions = {r.kind: r for r in page.courses[0].restrictions}
        assert restrictions["majors"].mode == "include"
        assert restrictions["majors"].values == ["Computer Science", "Data Science"]
        assert restrictions["classes"].mode == "exclude"
        assert restrictions["classes"].values == ["Freshman 0 to 29 Credits"]

    def test_attributes_and_prerequisites(self, page):
        course = page.courses[0]
        assert course.attributes == ["GQ", "HO"]
        assert course.prerequisites.node_type is RuleNodeType.ANY

    def test_relationships_say_what_the_sentence_states(self, page):
        kinds = {(r.subject, r.number): r.kind for r in page.courses[0].relationships}
        assert kinds == {
            ("MATH", "0823"): "duplicate_credit",
            ("CIS", "1001"): "mentioned",
        }


# ── Program pages ────────────────────────────────────────────────────────────


def _requirements_page(rows: str) -> str:
    return f"""
    <html><body><h1 class="page-title">Example BS</h1>
    <main id="contentarea"><div id="requirementstextcontainer">
    <h3>Major Requirements</h3>
    <table class="sc_courselist"><tbody>{rows}</tbody></table>
    <dl class="sc_footnotes"><dd>Footnote one.</dd></dl>
    </div></main></body></html>
    """


def _course_row(code: str, credits: str = "", indent: bool = False, alt: bool = False):
    inner = f'<div class="blockindent">{code}</div>' if indent else code
    row_class = "orclass" if alt else "even"
    return (
        f'<tr class="{row_class}"><td class="codecol">{inner}</td><td>Title</td>'
        f'<td class="hourscol">{credits}</td></tr>'
    )


def _comment_row(text: str, credits: str = "", header: bool = False):
    row_class = "even areaheader" if header else "even"
    return (
        f'<tr class="{row_class}"><td colspan="2"><span class="courselistcomment">'
        f'{text}</span></td><td class="hourscol">{credits}</td></tr>'
    )


class TestRequirementTables:
    def test_choice_takes_indented_rows_and_or_rows_become_alternatives(self):
        page = parse_program_page(
            _requirements_page(
                _comment_row("Computer Science Courses", header=True)
                + _course_row("CIS 1001", "1")
                + _comment_row("Select one of the following:", "4")
                + _course_row("CIS 1051", indent=True)
                + _course_row("or CIS 1951", indent=True, alt=True)
                + _course_row("CIS 1057", indent=True)
                + _course_row("CIS 1068", "4")
                + '<tr class="listsum"><td colspan="2">Total</td>'
                '<td class="hourscol">9</td></tr>'
            )
        )
        tree = page.requirement_tables[0].tree
        assert tree.params["total_credits_text"] == "9"
        assert tree.params["footnotes"] == ["Footnote one."]
        section = tree.children[0]
        assert section.node_type is RuleNodeType.SECTION
        assert _types(section) == [
            RuleNodeType.COURSE,
            RuleNodeType.ANY,
            RuleNodeType.COURSE,
        ]
        choice = section.children[1]
        assert _types(choice) == [RuleNodeType.ANY, RuleNodeType.COURSE]
        assert _codes(choice.children[0]) == ["CIS 1051", "CIS 1951"]
        assert page.parse_status is ParseStatus.COMPLETE

    def test_unindented_choice_runs_to_the_next_comment(self):
        page = parse_program_page(
            _requirements_page(
                _comment_row("Second writing-intensive course can be chosen from:")
                + _course_row("CIS 4397", "3")
                + _course_row("CIS 4398", "3")
                + _comment_row("All students MUST take:")
                + _course_row("CIS 3296", "4")
            )
        )
        choice, required = page.requirement_tables[0].tree.children
        assert choice.node_type is RuleNodeType.ANY
        assert _codes(choice) == ["CIS 4397", "CIS 4398"]
        assert required.node_type is RuleNodeType.ALL

    def test_credit_and_count_selections(self):
        page = parse_program_page(
            _requirements_page(
                _comment_row("Select 15-16 credits from the following:", "15-16")
                + _course_row("CIS 3203", indent=True)
                + _comment_row("Select at least two of the following:")
                + _course_row("CIS 4331", indent=True)
                + _course_row("CIS 4345", indent=True)
            )
        )
        credits, count = page.requirement_tables[0].tree.children
        assert (credits.min_credits, credits.max_credits) == (Decimal(15), Decimal(16))
        assert (count.node_type, count.min_count) == (RuleNodeType.COUNT, 2)

    def test_requirements_in_words_stay_text(self):
        page = parse_program_page(
            _requirements_page(
                _comment_row("Laboratory Science courses", header=True)
                + _comment_row("Two (2) laboratory science courses", "8")
            )
        )
        text = page.requirement_tables[0].tree.children[0].children[0]
        assert text.node_type is RuleNodeType.TEXT
        assert text.min_credits == Decimal(8)
        assert page.parse_status is ParseStatus.PARTIAL

    def test_sequence_headings_are_flagged_as_possible_alternatives(self):
        page = parse_program_page(
            _requirements_page(
                _comment_row("Biology Sequence", header=True) + _course_row("BIOL 1011")
            )
        )
        section = page.requirement_tables[0].tree.children[0]
        assert section.params["may_be_alternatives"]
        assert section.parse_status is ParseStatus.PARTIAL

    def test_saved_program_page(self, bulletin_html):
        page = parse_program_page(bulletin_html)
        assert page.name == "Computer Science BS"
        assert page.program_code == "ST-CSCI-BS"
        assert len(page.requirement_tables) == 3
        courses = {
            node.label
            for table in page.requirement_tables
            for node in table.tree.walk()
            if node.node_type is RuleNodeType.COURSE
        }
        assert {"CIS 3296", "CIS 2168", "MATH 1041"} <= courses
        terms = page.plans[0].terms
        assert (terms[0].year_number, terms[0].term) == (1, "Fall")
        assert terms[0].items[0].courses == [("CIS", "1001")]


PROGRAM_INDEX = """
<html><body>
<table class="sc_sctable tbl_keys"><tbody><tr><td>ST</td><td>Science and Technology</td>
</tr></tbody></table>
<table class="sc_sctable tbl_keys"><tbody><tr><td>BS</td><td>Bachelor of Science</td>
</tr></tbody></table>
<table><tbody>
<tr><td>Computer Science</td>
  <td><a href="/undergraduate/science-technology/computer-science-bs/">BS</a> ,
      <a href="/undergraduate/science-technology/computer-science-minor/">Minor</a></td>
  <td></td><td></td><td>ST</td></tr>
<tr><td>Piano Pedagogy</td>
  <td><a href="/undergraduate/boyer/piano-pedagogy-bm/">BM (not currently open)</a></td>
  <td></td><td></td><td>BC</td></tr>
</tbody></table></body></html>
"""


class TestProgramIndex:
    def test_listings(self):
        index = parse_program_index(PROGRAM_INDEX, f"{ORIGIN}/academic-programs/")
        assert index.unit_names == {"ST": "Science and Technology"}
        assert index.degree_names == {"BS": "Bachelor of Science"}
        assert [(item.label, item.kind) for item in index.listings] == [
            ("BS", ProgramKind.MAJOR),
            ("Minor", ProgramKind.MINOR),
            ("BM", ProgramKind.MAJOR),
        ]
        assert index.listings[0].url == (
            f"{ORIGIN}/undergraduate/science-technology/computer-science-bs/"
        )

    def test_slugs_fall_back_to_paths_when_they_collide(self):
        slugs = _program_slugs(
            [
                "/undergraduate/a/music-minor/",
                "/undergraduate/b/music-minor/",
                "/x/cs-bs/",
            ]
        )
        assert slugs == {
            "/undergraduate/a/music-minor/": "undergraduate/a/music-minor",
            "/undergraduate/b/music-minor/": "undergraduate/b/music-minor",
            "/x/cs-bs/": "cs-bs",
        }


# ── Pages ────────────────────────────────────────────────────────────────────


class TestPages:
    def test_archive_and_current_paths_share_a_layout(self):
        archived = f"{ORIGIN}/archives/2024-2025/undergraduate/courses/cis/"
        assert edition_path(archived) == "/undergraduate/courses/cis/"
        assert edition_root("2024-2025") == f"{ORIGIN}/archives/2024-2025"
        assert edition_root("2026-2027") == ORIGIN

    @pytest.mark.parametrize(
        ("path", "kind"),
        [
            ("/undergraduate/courses/cis/", PageKind.COURSE_SUBJECT),
            ("/undergraduate/courses/", PageKind.OTHER),
            ("/undergraduate/general-education/ga/", PageKind.GENERAL_EDUCATION),
            ("/undergraduate/academic-policies/grading/", PageKind.POLICY),
            ("/academic-programs/", PageKind.PROGRAM_INDEX),
            ("/undergraduate/science-technology/cs-bs/", PageKind.PROGRAM),
        ],
    )
    def test_classify(self, path, kind):
        assert classify_page(path, {"/undergraduate/science-technology/cs-bs/"}) is kind

    def test_edition_labels(self):
        assert academic_year_start("2022-2023") == 2022
        with pytest.raises(ValueError):
            academic_year_start("2022-2024")

    def test_policy_number_is_its_own_not_one_it_cites(self):
        own = policy_from_text(
            "Repeating a Course", "Repeating ( Policy # 02.10.12 ) …"
        )
        assert own.policy_number == "02.10.12"
        cited = policy_from_text("Forgiveness", "x " * 200 + "see Policy # 02.10.12")
        assert cited.policy_number == ""

    @pytest.mark.parametrize(
        ("title", "requirement", "count", "status"),
        [
            ("Arts (GA)", "One 3-credit hour course.", 1, ParseStatus.COMPLETE),
            (
                "Science &amp; Technology (GS)",
                "Two 3-credit hour courses.",
                2,
                ParseStatus.COMPLETE,
            ),
            ("Arts (GA)", "Courses vary.", None, ParseStatus.PARTIAL),
        ],
    )
    def test_gened_area(self, title, requirement, count, status):
        html = (
            f'<h1 class="page-title">{title}</h1>'
            f'<main id="contentarea">Requirement: {requirement} More text.</main>'
        )
        gened = parse_gened_page(html)
        assert gened.tree.node_type is RuleNodeType.ATTRIBUTE
        assert (gened.tree.min_count, gened.tree.parse_status) == (count, status)

    def test_gened_with_two_areas(self):
        html = (
            '<h1 class="page-title">Intellectual Heritage (GY &amp; GZ)</h1>'
            '<main id="contentarea">Requirement: IH I and IH II.</main>'
        )
        gened = parse_gened_page(html)
        assert gened.codes == ["GY", "GZ"]
        assert [child.attribute for child in gened.tree.children] == ["GY", "GZ"]

    def test_gened_overview_names_no_area(self):
        assert parse_gened_page('<h1 class="page-title">General Education</h1>') is None


# ── Crawling and captures ────────────────────────────────────────────────────


class TestCrawler:
    @pytest.mark.parametrize(
        ("url", "in_scope"),
        [
            (f"{ORIGIN}/undergraduate/courses/cis/", True),
            (f"{ORIGIN}/academic-programs/", True),
            (f"{ORIGIN}/graduate/courses/cis/", False),
            (f"{ORIGIN}/undergraduate/courses/cis/cis.pdf", False),
            ("https://example.com/undergraduate/", False),
        ],
    )
    def test_scope(self, url, in_scope):
        assert is_in_scope(url) is in_scope

    def test_sitemap(self):
        xml = (
            b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            b"<url><loc>https://bulletin.temple.edu/about-courses/#top</loc></url>"
            b"</urlset>"
        )
        assert sitemap_urls(xml) == [f"{ORIGIN}/about-courses/"]

    def test_no_robots_txt_means_no_crawl(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(503))
        with (
            httpx.Client(transport=transport) as client,
            pytest.raises(RobotsUnavailableError),
        ):
            Crawler.connect(client)

    def test_crawl_keeps_to_scope_and_obeys_robots(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "app.modules.bulletin.ingest.crawler.SECONDS_BETWEEN_REQUESTS", 0
        )
        pages = {
            ROBOTS_URL: "User-agent: *\nDisallow: /undergraduate/private/\n",
            SITEMAP_URL: (
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                f"<url><loc>{ORIGIN}/undergraduate/</loc></url>"
                f"<url><loc>{ORIGIN}/graduate/</loc></url></urlset>"
            ),
            f"{ORIGIN}/undergraduate/": (
                '<a href="/undergraduate/courses/cis/">CIS</a>'
                '<a href="/undergraduate/private/">Private</a>'
                '<a href="/archives/2024-2025/undergraduate/">Archive</a>'
            ),
            f"{ORIGIN}/undergraduate/courses/cis/": "<p>Courses</p>",
        }
        requested: list[str] = []

        def respond(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            requested.append(url)
            if url not in pages:
                return httpx.Response(404, text="missing")
            return httpx.Response(
                200, text=pages[url], headers={"content-type": "text/html"}
            )

        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            captured = Crawler.connect(client).crawl(CaptureWriter(tmp_path))

        assert captured == 2
        assert f"{ORIGIN}/undergraduate/private/" not in requested
        assert not any("/archives/" in url or "/graduate/" in url for url in requested)
        urls = {response.url for response in read_capture(tmp_path)}
        assert urls == {
            f"{ORIGIN}/undergraduate/",
            f"{ORIGIN}/undergraduate/courses/cis/",
        }


class TestCapture:
    def test_round_trip_keeps_the_latest_response_per_url(self, tmp_path):
        writer = CaptureWriter(tmp_path)
        writer.write(f"{ORIGIN}/a/", 500, "text/html", b"error")
        writer.write(f"{ORIGIN}/a/", 200, "text/html; charset=UTF-8", b"<p>ok</p>")
        (response,) = read_capture(tmp_path)
        assert response.is_html
        assert response.read_text() == "<p>ok</p>"
        assert writer.captured_urls() == {f"{ORIGIN}/a/"}

    def test_edition_pages_drop_other_editions_aliases_and_graduate_pages(
        self, tmp_path
    ):
        writer = CaptureWriter(tmp_path)
        archive = f"{ORIGIN}/archives/2024-2025"
        for url in (
            f"{archive}/undergraduate/courses/cis/",
            f"{archive}/undergraduate/courses/cis",
            f"{archive}/graduate/courses/cis/",
            f"{archive}/academic-programs/",
            f"{ORIGIN}/undergraduate/courses/cis/",
        ):
            writer.write(url, 200, "text/html", b"<p></p>")
        responses = list(read_capture(tmp_path))
        archived = edition_responses(responses, "2024-2025")
        assert sorted(archived) == [
            "/academic-programs/",
            "/undergraduate/courses/cis/",
        ]
        current = edition_responses(responses, "2026-2027")
        assert list(current) == ["/undergraduate/courses/cis/"]
