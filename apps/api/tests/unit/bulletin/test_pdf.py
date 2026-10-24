"""PDF extraction on real 2024-2025 CourseLeaf printouts (fixtures/pdf), checked
against what the HTML twin of each page says."""

from __future__ import annotations

import io
from pathlib import Path

import pytest

pdfplumber = pytest.importorskip("pdfplumber", reason="needs the `ingest` group")

from app.modules.bulletin.ingest.extract import pdf

FIXTURES = Path(__file__).parent / "fixtures" / "pdf"
ARCHIVE = "https://bulletin.temple.edu/archives/2024-2025"
CS_BS_URL = f"{ARCHIVE}/undergraduate/science-technology/computer-science-bs/computer-science-bs.pdf"
CIS_URL = f"{ARCHIVE}/graduate/courses/cis/cis.pdf"
MINOR_URL = (
    f"{ARCHIVE}/undergraduate/science-technology/data-science-computational-analytics-minor/"
    "data-science-computational-analytics-minor.pdf"
)
SHA = "0" * 64


def body(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


@pytest.fixture(scope="module")
def cs_bs_tables():
    return pdf.pdf_requirement_tables(body("computer-science-bs.pdf"), CS_BS_URL, SHA)


@pytest.fixture(scope="module")
def cis_courses():
    return pdf.pdf_courses(body("graduate-cis-courses.pdf"), CIS_URL, SHA)


@pytest.mark.parametrize(
    "name",
    [
        "computer-science-bs.pdf",
        "graduate-cis-courses.pdf",
        "data-science-computational-analytics-minor.pdf",
    ],
)
def test_document_keeps_every_character(name: str) -> None:
    content = body(name)
    with pdfplumber.open(io.BytesIO(content)) as document:
        raw = "".join(
            c["text"]
            for page in document.pages
            for c in page.chars
            if not c["text"].isspace()
        )
    blocks = pdf.pdf_document(content, f"{ARCHIVE}/x.pdf", SHA).blocks
    kept = "".join(block.text for block in blocks).replace(" ", "")
    assert len(kept) / len(raw) >= 0.99
    assert sorted(kept) == sorted(raw)


def test_document_structure_and_locators() -> None:
    document = pdf.pdf_document(body("computer-science-bs.pdf"), CS_BS_URL, SHA)
    assert document.heading == "Computer Science BS"
    assert document.edition_label == "2024-2025"
    headings = [b.text for b in document.blocks if b.kind == "heading"]
    assert "Summary of Requirements for the Degree" in headings
    code = next(b for b in document.blocks if b.text == "Program Code: ST-CSCI-BS")
    assert code.section == ["Computer Science BS", "Overview"]
    assert code.locator.page == 1
    x0, top, x1, bottom = code.locator.bbox
    assert 0 <= x0 < x1 <= 612 and 0 <= top < bottom <= 792
    # Running headers are kept as text, never dropped or mistaken for content.
    assert any(
        b.kind == "text" and b.text == "Computer Science BS 1" for b in document.blocks
    )
    assert any(
        link.url.endswith("/undergraduate/general-education/")
        for link in document.links
    )


def test_courses_match_the_html_listing(cis_courses) -> None:
    courses, unparsed = cis_courses
    assert len(courses) == 76  # the HTML twin's count
    assert unparsed == []
    course = next(c for c in courses if c.code == "CIS 5011")
    assert course.title == "Programming and Data Structure"
    assert course.credits.text == "3"
    assert [p.label for p in course.parts] == [
        "Level Registration Restrictions",
        "Repeatability",
    ]
    assert course.evidence.locator.page == 1


def test_wrapped_compounds_join_without_a_space(cis_courses) -> None:
    course = next(c for c in cis_courses[0] if c.code == "CIS 9190")
    assert "(MS and/or PhD degree)" in course.description


def test_requirement_rows_match_the_html_tables(cs_bs_tables) -> None:
    assert len(cs_bs_tables) == 3
    rows = [row for table in cs_bs_tables for row in table.rows]
    keyed = [(tuple(r.courses), r.hours) for r in rows if r.courses or r.hours]
    assert len(keyed) == 89  # every HTML row with courses or hours, as printed
    alternative = next(r for r in rows if r.courses == ["CIS 1057"])
    assert alternative.kind == "alternative" and alternative.indent == 0
    totals = [r for r in rows if r.kind == "total"]
    assert [(r.comment, r.hours) for r in totals] == [("Total Credit Hours", "73-74")]


def test_table_continues_across_pages_with_footnotes(cs_bs_tables) -> None:
    major = cs_bs_tables[1]
    pages = {row.locator.page for row in major.rows}
    assert pages == {2, 3}
    elective = next(r for r in major.rows if r.courses == ["CIS 3381"])
    assert elective.indent == 1 and elective.footnotes == ["3"]
    assert [f.marker for f in major.footnotes] == ["1", "2", "3", "4"]
    assert major.footnotes[2].courses == ["CIS 3381", "CIS 4282", "CIS 4382"]


def test_lecture_lab_pairs_are_one_row(cs_bs_tables) -> None:
    pair = next(
        r for t in cs_bs_tables for r in t.rows if r.courses[:1] == ["CHEM 1031"]
    )
    assert pair.courses == ["CHEM 1031", "CHEM 1033"]
    assert pair.joiner == "and"
    assert pair.title == "General Chemistry I and General Chemistry Laboratory I"


def test_selection_comment_keeps_hours_and_footnote(cs_bs_tables) -> None:
    select = next(
        r for t in cs_bs_tables for r in t.rows if r.comment.startswith("Select 15-16")
    )
    assert select.kind == "comment"
    assert select.hours == "15-16" and select.footnotes == ["2"]


def test_normalized_text_ignores_typography() -> None:
    from app.modules.bulletin.ingest.extract.pdf import normalized

    assert (
        normalized("Quality Assurance &amp; Testing ( QA )")
        == "quality assurance & testing (qa)"
    )


def test_text_without_a_course_title_gives_no_courses() -> None:
    courses, unparsed = pdf.pdf_courses(body("computer-science-bs.pdf"), CS_BS_URL, SHA)
    assert courses == [] and unparsed == []


@pytest.mark.parametrize(
    ("tokens", "expected"),
    [
        (["MEDS", "M010"], (["MEDS M010"], None)),  # Medicine's letter-led numbers
        (["CHEM", "1031", "&", "CHEM", "1033"], (["CHEM 1031", "CHEM 1033"], "and")),
        (["or", "CIS", "1057"], (["CIS 1057"], None)),
        (["GUS/ENST", "3061"], (["GUS/ENST 3061"], None)),
        (["BS"], ([], None)),  # a capitalized title word is not a code
    ],
)
def test_code_cell_tokens(tokens: list[str], expected) -> None:
    assert pdf._codes(tokens) == expected


def test_wrapped_letter_grade_keeps_its_space() -> None:
    def line(text: str) -> pdf.Line:
        word = pdf.Word(text, 0, 1, 0, 1, 8.0, False, False)
        return pdf.Line(page=1, words=[word], size=8.0)

    assert (
        pdf._join([line("ENGR 3003 (D-"), line("or higher)")])
        == "ENGR 3003 (D- or higher)"
    )
    assert pdf._join([line("African-"), line("centered")]) == "African-centered"


def test_edition_run_records_unreadable_pdfs(tmp_path: Path) -> None:
    from app.modules.bulletin.ingest.captures import import_file
    from app.modules.bulletin.ingest.crawl_state import CrawlState
    from app.modules.bulletin.ingest.store import ObjectStore

    archive = "https://bulletin.temple.edu/archives/2024-2025/undergraduate"
    damaged = tmp_path / "damaged.pdf"
    damaged.write_bytes(b"%PDF-1.4\nnot really a PDF")
    state = CrawlState(tmp_path / "crawl.sqlite3")
    store = ObjectStore(tmp_path / "objects")
    try:
        import_file(
            state,
            store,
            FIXTURES / "data-science-computational-analytics-minor.pdf",
            f"{archive}/science-technology/data-science-computational-analytics-minor/"
            "data-science-computational-analytics-minor.pdf",
        )
        import_file(state, store, damaged, f"{archive}/damaged/damaged.pdf")
        counts = pdf.extract_edition_pdfs(state, store, "2024-2025", tmp_path / "out")
    finally:
        state.close()
    assert counts["pdfs"] == 2
    assert counts["documents"] == 1
    assert counts["tables"] >= 1
    issues = (tmp_path / "out" / "issues.jsonl").read_text()
    assert '"code":"pdf_unreadable"' in issues
    assert "damaged.pdf" in issues
