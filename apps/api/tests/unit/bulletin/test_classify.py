from __future__ import annotations

from app.modules.bulletin.ingest.extract.classify import (
    PageKind,
    PageSignals,
    classify_page,
    edition_path,
)

BULLETIN = "https://bulletin.temple.edu"


def signals(url: str, **overrides: object) -> PageSignals:
    values = {
        "path": edition_path(url),
        "tab_ids": frozenset(),
        "has_course_blocks": False,
        "has_course_lists": False,
        "has_plan_grids": False,
        "prints_program_code": False,
    } | overrides
    return PageSignals(**values)  # type: ignore[arg-type]


def test_graduate_program_stub_without_requirements_is_a_program() -> None:
    # Finance MS: "Currently offered as an international partner program…"
    url = f"{BULLETIN}/graduate/scd/fox/finance-ms/"
    assert classify_page(url, signals(url)) is PageKind.PROGRAM


def test_archived_graduate_program_stub_is_a_program() -> None:
    url = f"{BULLETIN}/archives/2024-2025/graduate/scd/law/legal-education-llm/"
    assert classify_page(url, signals(url)) is PageKind.PROGRAM


def test_graduate_school_page_stays_a_unit() -> None:
    url = f"{BULLETIN}/graduate/scd/fox/"
    tabs = frozenset({"graduateprogramstextcontainer"})
    assert classify_page(url, signals(url, tab_ids=tabs)) is PageKind.ACADEMIC_UNIT


def test_undergraduate_information_page_without_tables_is_information() -> None:
    url = f"{BULLETIN}/undergraduate/campuses/ambler-campus/"
    assert classify_page(url, signals(url)) is PageKind.INFORMATION


def test_undergraduate_program_needs_requirements_or_tabs() -> None:
    url = f"{BULLETIN}/undergraduate/science-technology/computer-science-bs/"
    with_tables = signals(url, has_course_lists=True)
    assert classify_page(url, with_tables) is PageKind.PROGRAM


def test_page_title_wins_over_headings_in_the_content() -> None:
    from app.modules.bulletin.ingest.extract.document import page_document

    body = (
        b"<html><head><title>Public Policy MPP | Temple University Bulletin</title>"
        b'</head><body><h1 id="site-title"><a href="/">Bulletin 2026-2027</a></h1>'
        b'<h1 class="page-title">Public Policy MPP</h1><div id="contentarea">'
        b"<h1><strong>Admissions Criteria</strong></h1><p>Text.</p></div></body></html>"
    )
    url = f"{BULLETIN}/graduate/scd/cla/public-policy-mpp/"
    assert page_document(body, url, "0" * 64).heading == "Public Policy MPP"
