"""A full PDF volume split back into Bulletin pages, on trimmed real data.

`fixtures/volume/undergraduate-2026-2027.json.gz` holds 25 pages' text lines
(as `pdf.read_pdf` reads them) from the 2026-2027 undergraduate volume, the
bookmarks around them, and the page paths and tab labels the 2024-2025 HTML
edition gives those titles. The volume's own parse is replaced by the fixture's
lines, so the tests run in a second without the 32 MB volume.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

pytest.importorskip("pdfplumber", reason="needs the `ingest` group")

from app.modules.bulletin.ingest.extract import pdf, volume
from app.modules.bulletin.ingest.extract.classify import PageKind
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.run import EditionExtraction
from app.modules.bulletin.ingest.interpret.requirements import interpret_program

FIXTURES = Path(__file__).parent / "fixtures"
VOLUME_URL = "https://bulletin.temple.edu/pdf/2026-2027-undergraduate.pdf"
VOLUME_SHA = "408bc5b0662123fcbd6dedd984682a763bdd009cc7933c8b73309442feb8b038"
EDITION = "2026-2027"
SITE = "https://bulletin.temple.edu"
CS_BS = (
    "Schools, Colleges and Divisions",
    "College of Science and Technology",
    "Computer Science BS",
)
TOPICAL_STUDIES = ("Course Descriptions (Undergraduate)", "Topical Studies (TS)")
REQUIREMENT_ROLES = {"requirement", "curriculum"}


def _line(page: int, size: float, column: int, words: list[list]) -> pdf.Line:
    return pdf.Line(
        page=page,
        size=size,
        column=column,
        words=[
            pdf.Word(
                text=text,
                x0=x0,
                x1=x1,
                top=top,
                bottom=bottom,
                size=word_size,
                bold=bold,
                italic=italic,
                superscript=superscript,
            )
            for text, x0, x1, top, bottom, word_size, bold, italic, superscript in words
        ],
    )


@pytest.fixture(scope="module")
def fixture() -> dict:
    with gzip.open(FIXTURES / "volume" / "undergraduate-2026-2027.json.gz") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def text(fixture) -> pdf.PdfText:
    lines = [_line(*line) for line in fixture["lines"]]
    links = [
        pdf.PdfLink(page=page, bbox=tuple(bbox), url=url, text=text)
        for page, bbox, url, text in fixture["links"]
    ]
    gutters = {int(page): x for page, x in fixture["gutters"].items()}
    return pdf.PdfText(
        lines=lines, body_size=fixture["body_size"], links=links, gutters=gutters
    )


@pytest.fixture(scope="module")
def outline(fixture) -> list[volume.OutlineEntry]:
    return [volume.OutlineEntry.model_validate(entry) for entry in fixture["outline"]]


@pytest.fixture(scope="module")
def references(fixture) -> dict[volume.TitlePath, frozenset[str]]:
    return {tuple(key): frozenset(paths) for key, paths in fixture["references"]}


def extract(
    monkeypatch, text, outline, references, vocabulary, overrides=None
) -> EditionExtraction:
    body = b"volume fixture"
    monkeypatch.setattr(pdf, "read_pdf", lambda _: text)
    monkeypatch.setattr(volume, "read_outline", lambda _: outline)
    return volume.extract_volume(
        body, VOLUME_URL, VOLUME_SHA, EDITION, references, vocabulary, overrides
    )


@pytest.fixture()
def result(monkeypatch, fixture, text, outline, references) -> EditionExtraction:
    return extract(monkeypatch, text, outline, references, fixture["tabs"])


def page(result: EditionExtraction, path: str):
    return next(p for p in result.pages if p.document.url == f"{SITE}{path}")


def program(result: EditionExtraction, path: str) -> ProgramPage:
    return next(p for p in result.programs if p.url == f"{SITE}{path}")


def html_program(name: str) -> ProgramPage:
    path = FIXTURES / "requirements" / f"{name}.json"
    return ProgramPage.model_validate_json(path.read_text())


def requirement_courses(page: ProgramPage) -> set[str]:
    def walk(nodes):
        for node in nodes:
            yield node
            yield from walk(node.children)

    roots = [r for r in interpret_program(page).roots if r.role in REQUIREMENT_ROLES]
    return {node.course for node in walk(roots) if node.course}


def test_titles_compare_without_years_case_or_punctuation() -> None:
    assert volume.normalized_title("Boyer College of Music & Dance") == (
        volume.normalized_title("Boyer College of Music and Dance")
    )
    assert volume.normalized_title("Temple Bulletins 2026-2027") == "temple bulletins"


def test_a_pdf_without_bookmarks_is_reported_not_split() -> None:
    body = (FIXTURES / "pdf" / "computer-science-bs.pdf").read_bytes()
    assert volume.read_outline(body) == []
    result = volume.extract_volume(body, VOLUME_URL, VOLUME_SHA, EDITION, {})
    assert [issue.code for issue in result.issues] == ["volume_without_outline"]
    assert not result.pages


def test_sections_take_their_url_from_another_editions_page(
    outline, references
) -> None:
    sections = {
        tuple(s.titles): s
        for s in volume.split_volume(outline, VOLUME_URL, EDITION, references)
    }
    cs = sections[CS_BS]
    assert cs.basis == "reference"
    assert cs.url == f"{SITE}/undergraduate/science-technology/computer-science-bs/"
    archived = volume.split_volume(outline, VOLUME_URL, "2025-2026", references)
    assert next(s for s in archived if tuple(s.titles) == CS_BS).url == (
        f"{SITE}/archives/2025-2026/undergraduate/science-technology/computer-science-bs/"
    )


def test_course_listings_fall_back_to_their_subject_code(outline, references) -> None:
    without = {
        k: v for k, v in references.items() if k != volume.title_key(TOPICAL_STUDIES)
    }
    sections = {
        tuple(s.titles): s
        for s in volume.split_volume(outline, VOLUME_URL, EDITION, without)
    }
    listing = sections[TOPICAL_STUDIES]
    assert listing.basis == "course_code"
    assert listing.path == "/undergraduate/courses/ts/"


def test_unmapped_sections_keep_their_place_in_the_volume(
    monkeypatch, fixture, text, outline, references
) -> None:
    without = {k: v for k, v in references.items() if k != volume.title_key(CS_BS)}
    result = extract(monkeypatch, text, outline, without, fixture["tabs"])
    [issue] = [i for i in result.issues if i.code == "volume_section_unmapped"]
    # Requirement tables need a page identity: publication waits for a person.
    assert issue.severity == "error"
    assert issue.url == f"{VOLUME_URL}#page=1398&top=632"
    assert not any(p.name == "Computer Science BS" for p in result.programs)

    overrides = {
        " › ".join(CS_BS): "/undergraduate/science-technology/computer-science-bs/"
    }
    fixed = extract(monkeypatch, text, outline, without, fixture["tabs"], overrides)
    assert not [i for i in fixed.issues if i.code == "volume_section_unmapped"]
    assert any(p.name == "Computer Science BS" for p in fixed.programs)


@pytest.mark.parametrize(
    ("path", "html"),
    [
        (
            "/undergraduate/science-technology/computer-science-bs/",
            "computer-science-bs",
        ),
        (
            "/undergraduate/science-technology/data-science-computational-analytics-minor/",
            "data-science-computational-analytics-minor",
        ),
    ],
)
def test_programs_read_like_their_html_pages(result, path: str, html: str) -> None:
    from_volume = program(result, path)
    from_html = html_program(html)
    assert from_volume.name == from_html.name
    assert from_volume.units == from_html.units
    assert from_volume.fact("Program Code") == from_html.fact("Program Code")
    assert requirement_courses(from_volume) == requirement_courses(from_html)
    volume_roles = [r.role for r in interpret_program(from_volume).roots]
    html_roles = [r.role for r in interpret_program(from_html).roots]
    assert volume_roles == html_roles


def test_evidence_points_into_the_volume(result) -> None:
    cs = program(result, "/undergraduate/science-technology/computer-science-bs/")
    assert cs.sha256 == VOLUME_SHA
    for table in cs.tables:
        assert table.evidence.url == VOLUME_URL
        assert table.evidence.locator.page in range(1398, 1405)
        assert all(row.locator.bbox for row in table.rows)
    for entry in result.courses.values():
        assert entry.course.evidence.url == VOLUME_URL
        assert entry.course.evidence.sha256 == VOLUME_SHA
        assert entry.course.evidence.locator.page == 2893
    assert cs.source_url == VOLUME_URL
    assert all(fact.evidence.url == VOLUME_URL for fact in cs.facts)
    blocks = page(
        result, "/undergraduate/science-technology/computer-science-bs/"
    ).document
    # The page is the Bulletin's; what it cites is the volume it was read from.
    assert blocks.url != VOLUME_URL and blocks.source_url == VOLUME_URL
    assert {blocks.evidence(block).url for block in blocks.blocks} == {VOLUME_URL}
    assert all(p.document.source_url == VOLUME_URL for p in result.pages)
    assert all(b.locator.page and b.locator.bbox for b in blocks.blocks)
    # The running header (page number, volume title) isn't the page's content.
    assert not any(
        "Temple University Undergraduate Bulletin" in b.text for b in blocks.blocks
    )


def test_courses_stay_within_their_listing(result) -> None:
    listing = f"{SITE}/undergraduate/courses/ts/"
    entries = [e for e in result.courses.values() if e.also_listed_on[0].url == listing]
    assert sorted(e.course.code for e in entries) == [
        "TS 1185",
        "TS 1285",
        "TS 3082",
        "TS 4082",
    ]
    # The listing's last course doesn't run on into the next listing.
    last = max(entries, key=lambda e: e.course.code).course
    text = " ".join([last.description, *(part.text for part in last.parts)])
    assert "Tourism and Hospitality Management" not in text


def test_subheadings_without_pages_merge_into_their_parent(result) -> None:
    calendar_url = f"{SITE}/undergraduate/student-resources/academic-calendar/"
    merged = [
        i
        for i in result.issues
        if i.code == "volume_section_merged" and i.url == calendar_url
    ]
    assert len(merged) == 4
    calendar = page(
        result, "/undergraduate/student-resources/academic-calendar/"
    ).document
    assert {b.locator.page for b in calendar.blocks} >= {1732, 1733, 1736}


def test_printed_tab_labels_become_tabs(result) -> None:
    marketing = page(
        result, "/undergraduate/fox-business-management/marketing-minor/"
    ).document
    assert [(t.id, t.label) for t in marketing.tabs] == [
        ("textcontainer", "Overview"),
        ("requirementstextcontainer", "Requirements"),
    ]
    dance = program(result, "/undergraduate/boyer-music-dance/dance-minor/")
    # Its first table sits right under "Overview": beside the program, as on the site.
    assert [t.tab for t in dance.tables][:1] == ["textcontainer"]
    assert [r.role for r in interpret_program(dance).roots][:1] == ["other"]


def test_pages_holding_programs_are_units(result) -> None:
    assert (
        page(result, "/undergraduate/science-technology/").kind
        is PageKind.ACADEMIC_UNIT
    )
    assert page(result, "/undergraduate/courses/ts/").kind is PageKind.COURSE_LISTING
    cs = page(result, "/undergraduate/science-technology/computer-science-bs/").document
    assert [c.text for c in cs.breadcrumbs] == ["Home", "Undergraduate", *CS_BS]


def test_sections_keep_their_links(result, text) -> None:
    linked = [p for p in result.pages if p.document.links]
    assert linked
    for page_ in linked:
        blocks = {block.index: block for block in page_.document.blocks}
        for link in page_.document.links:
            block = blocks[link.block_index]
            assert link.text
            assert link.text.replace(" ", "")[:15] in block.text.replace(" ", "")
    printed = {(link.url, link.text) for link in text.links}
    kept = {(link.url, link.text) for p in result.pages for link in p.document.links}
    assert kept <= printed


GRADUATE_URL = "https://bulletin.temple.edu/archives/2024-2025/pdf/2024_2025_Graduate_Professional_Temple_final.pdf"
GRADUATE_SHA = "3c94714cbb998dcfbc8c906a9453ab977a9907a71ba5f044e916fc688249c701"
QARA_CERTIFICATE = "/graduate/scd/pharmacy/advanced-regulatory-affairs-quality-assurance-postmasters-certificate/"
CIS_PHD = "/graduate/scd/cst/computer-information-science-phd/"


@pytest.fixture(scope="module")
def graduate() -> dict:
    """Two-column pages of the 2024-2025 graduate/professional volume."""
    with gzip.open(FIXTURES / "volume" / "graduate-2024-2025.json.gz") as handle:
        return json.load(handle)


@pytest.fixture()
def graduate_result(monkeypatch, graduate) -> EditionExtraction:
    text = pdf.PdfText(
        lines=[_line(*line) for line in graduate["lines"]],
        body_size=graduate["body_size"],
        links=[
            pdf.PdfLink(page=page, bbox=tuple(bbox), url=url, text=text)
            for page, bbox, url, text in graduate["links"]
        ],
        gutters={int(page): x for page, x in graduate["gutters"].items()},
    )
    outline = [
        volume.OutlineEntry.model_validate(entry) for entry in graduate["outline"]
    ]
    references = {tuple(key): frozenset(paths) for key, paths in graduate["references"]}
    monkeypatch.setattr(pdf, "read_pdf", lambda _: text)
    monkeypatch.setattr(volume, "read_outline", lambda _: outline)
    return volume.extract_volume(
        b"graduate fixture",
        GRADUATE_URL,
        GRADUATE_SHA,
        "2024-2025",
        references,
        graduate["tabs"],
    )


def graduate_program(result: EditionExtraction, path: str) -> ProgramPage:
    return next(p for p in result.programs if p.url.endswith(path))


@pytest.mark.parametrize("path", [CIS_PHD, QARA_CERTIFICATE])
def test_two_column_programs_read_like_their_html_pages(
    graduate, graduate_result, path
) -> None:
    html = next(
        ProgramPage.model_validate(p)
        for p in graduate["html_programs"]
        if p["url"].endswith(path)
    )
    from_volume = graduate_program(graduate_result, path)
    assert len(from_volume.tables) == len(html.tables)
    assert requirement_courses(from_volume) == requirement_courses(html)
    assert from_volume.fact("Program Code") == html.fact("Program Code")


def test_a_table_continues_into_the_right_column(graduate, graduate_result) -> None:
    [table] = graduate_program(graduate_result, QARA_CERTIFICATE).tables
    rows = {row.code_text: row for row in table.rows if row.code_text}
    gutter = graduate["gutters"]["814"]
    left, right = rows["QARA 5000"], rows["QARA 5512"]
    assert left.locator.bbox[0] < gutter < right.locator.bbox[0]
    # Read against the column it's printed in, not the header's.
    assert right.indent == left.indent
    assert right.kind == left.kind == "course"


def test_sections_start_where_their_bookmark_points(graduate_result) -> None:
    # The PhD's bookmark is in the right column of page 952, below the end
    # of the previous program in the left column.
    phd = next(
        p for p in graduate_result.pages if p.document.url.endswith(CIS_PHD)
    ).document
    assert phd.blocks[0].text == "Computer and Information Science PhD"
    assert phd.blocks[0].locator.page == 952
    assert phd.source_url == GRADUATE_URL
