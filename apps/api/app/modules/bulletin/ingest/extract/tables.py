"""CourseLeaf's requirement tables, plan grids and footnotes, row by row.

This is structural extraction only: each row is recorded as printed (its
CourseLeaf row classes, indentation, the courses in its code cell, title,
hours, comment and footnote markers), and nothing is inferred about what a
group of rows requires. Turning rows into a requirement tree is the
interpretation step's job, so its rules can change without re-extracting.

Two layouts carry alternatives differently: a requirement table
(`table.sc_courselist`) puts each alternative on its own `tr.orclass` row,
while a plan grid (`table.sc_plangrid`) lists them inside one code cell
("CIS 1051 / or CIS 1951"). Lab-lecture pairs appear in both as "A & B".
"""

from __future__ import annotations

import re
from typing import Literal

from lxml import html

from app.modules.bulletin.ingest.extract.document import clean_text
from app.modules.bulletin.ingest.records import Evidence, Locator, Record

RowKind = Literal["course", "alternative", "area_header", "comment", "total", "empty"]
PlanRowKind = Literal["course", "comment", "term_total", "plan_total"]

FOOTNOTE_MARKER = re.compile(r"^\s*([0-9]+|[*†‡§a-z])\s*$")


class TableRow(Record):
    index: int
    kind: RowKind
    # Course codes in the code cell, in order ("CHEM 1031", "CHEM 1033").
    courses: list[str]
    # How the code cell joins them: "and" for "A & B", "or" for "A or B".
    joiner: Literal["and", "or"] | None = None
    code_text: str
    title: str
    hours: str
    comment: str
    indent: int
    footnotes: list[str]
    classes: list[str]
    locator: Locator


class Footnote(Record):
    marker: str
    text: str
    courses: list[str]
    evidence: Evidence


class CourseListTable(Record):
    index: int
    rows: list[TableRow]
    footnotes: list[Footnote]
    # Headings above the table and the tab it sits in.
    section: list[str]
    tab: str | None
    evidence: Evidence


class PlanRow(Record):
    kind: PlanRowKind
    courses: list[str]
    joiner: Literal["and", "or"] | None = None
    code_text: str
    title: str
    hours: str
    footnotes: list[str]
    locator: Locator


class PlanTerm(Record):
    year: str
    term: str
    rows: list[PlanRow]


class PlanGrid(Record):
    index: int
    # Headings above the grid ("Bachelor of Science in Computer Science",
    # "Suggested Plan for New Students Starting in the 2026-2027 Academic Year").
    section: list[str]
    tab: str | None
    terms: list[PlanTerm]
    total_hours: str
    footnotes: list[Footnote]
    evidence: Evidence


def _classes(element: html.HtmlElement) -> list[str]:
    return (element.get("class") or "").split()


def footnote_markers(element: html.HtmlElement) -> list[str]:
    return [
        match[1]
        for sup in element.iter("sup")
        if (match := FOOTNOTE_MARKER.match(sup.text_content()))
    ]


def text_without_footnotes(element: html.HtmlElement) -> str:
    """Cell text with footnote superscripts removed and `<br>` read as a space."""
    parts: list[str] = []

    def collect(node: html.HtmlElement) -> None:
        if node.tag == "sup" and FOOTNOTE_MARKER.match(node.text_content()):
            parts.append(node.tail or "")
            return
        if node.tag == "br":
            parts.append(" ")
        parts.append(node.text or "")
        for child in node:
            if isinstance(child.tag, str):
                collect(child)
            else:
                parts.append(child.tail or "")
        if node is not element:
            parts.append(node.tail or "")

    collect(element)
    return clean_text("".join(parts))


def cell_courses(cell: html.HtmlElement) -> tuple[list[str], str | None]:
    codes = [
        clean_text(title)
        for title in cell.xpath('.//a[contains(@class,"bubblelink")]/@title')
    ]
    text = clean_text(cell.text_content())
    joiner = None
    if len(codes) > 1:
        joiner = "and" if "&" in text else "or" if re.search(r"\bor\b", text) else None
    return list(dict.fromkeys(codes)), joiner


def indent_level(row: html.HtmlElement) -> int:
    """How far the row's first cell is indented (`div.blockindent` nesting)."""
    first_cell = next((cell for cell in row if isinstance(cell.tag, str)), None)
    if first_cell is None:
        return 0
    depth = 0
    node = first_cell
    while True:
        nested = node.xpath(
            './*[contains(@class,"blockindent")] | ./span/*[contains(@class,"blockindent")]'
        )
        if not nested or not _is_leading(node, nested[0]):
            return depth
        depth += 1
        node = nested[0]


def _is_leading(parent: html.HtmlElement, child: html.HtmlElement) -> bool:
    """True if nothing but whitespace comes before `child` in `parent`."""
    if (parent.text or "").strip():
        return False
    for sibling in parent:
        if sibling is child or child in sibling.iterdescendants():
            return True
        if (sibling.text_content() or "").strip() or (sibling.tail or "").strip():
            return False
    return False


def _row_kind(
    classes: list[str], cells: list[html.HtmlElement], courses: list[str]
) -> RowKind:
    if "listsum" in classes:
        return "total"
    if "areaheader" in classes:
        return "area_header"
    if "orclass" in classes:
        return "alternative"
    if courses and any("codecol" in _classes(cell) for cell in cells):
        return "course"
    if any(cell.xpath('.//*[contains(@class,"courselistcomment")]') for cell in cells):
        return "comment"
    if any(text_without_footnotes(cell) for cell in cells):
        return "comment"
    return "empty"


def parse_table_rows(table: html.HtmlElement) -> list[TableRow]:
    tree = table.getroottree()
    rows: list[TableRow] = []
    for tr in table.iter("tr"):
        classes = _classes(tr)
        if "hidden" in classes:
            continue
        cells = [
            cell
            for cell in tr
            if isinstance(cell.tag, str) and cell.tag in {"td", "th"}
        ]
        if not cells:
            continue
        code_cell = next((c for c in cells if "codecol" in _classes(c)), None)
        hours_cell = next((c for c in cells if "hourscol" in _classes(c)), None)
        other_cells = [c for c in cells if c is not code_cell and c is not hours_cell]
        courses, joiner = (
            cell_courses(code_cell) if code_cell is not None else ([], None)
        )
        kind = _row_kind(classes, cells, courses)
        code_text = text_without_footnotes(code_cell) if code_cell is not None else ""
        title = " ".join(text_without_footnotes(c) for c in other_cells)
        comment = ""
        if kind in {"comment", "area_header", "total"}:
            comment = clean_text(code_text + " " + title)
            if code_cell is None:
                title = ""
        rows.append(
            TableRow(
                index=len(rows),
                kind=kind,
                courses=courses,
                joiner=joiner,
                code_text=code_text,
                title=title if kind in {"course", "alternative"} else "",
                hours=text_without_footnotes(hours_cell)
                if hours_cell is not None
                else "",
                comment=comment,
                indent=indent_level(tr),
                footnotes=footnote_markers(tr),
                classes=classes,
                locator=Locator(xpath=tree.getpath(tr), line=tr.sourceline),
            )
        )
    return rows


def parse_footnotes(
    footnote_list: html.HtmlElement, url: str, sha256: str
) -> list[Footnote]:
    tree = footnote_list.getroottree()
    footnotes = []
    terms = footnote_list.xpath("./dt")
    for term in terms:
        definition = term.getnext()
        while definition is not None and definition.tag != "dd":
            definition = definition.getnext()
        if definition is None:
            continue
        marker = clean_text(term.text_content())
        footnotes.append(
            Footnote(
                marker=marker,
                text=clean_text(definition.text_content()),
                courses=cell_courses(definition)[0],
                evidence=Evidence(
                    url=url,
                    sha256=sha256,
                    locator=Locator(
                        xpath=tree.getpath(definition), line=definition.sourceline
                    ),
                    text=clean_text(definition.text_content()),
                ),
            )
        )
    return footnotes


def following_footnotes(table: html.HtmlElement) -> html.HtmlElement | None:
    """The `dl.sc_footnotes` that CourseLeaf prints right after a table."""
    sibling = table.getnext()
    while (
        sibling is not None
        and sibling.tag in {"br", "p"}
        and not clean_text(sibling.text_content())
    ):
        sibling = sibling.getnext()
    if sibling is not None and "sc_footnotes" in _classes(sibling):
        return sibling
    return None


def parse_plan_grid(table: html.HtmlElement) -> tuple[list[PlanTerm], str]:
    tree = table.getroottree()
    terms: list[PlanTerm] = []
    year = ""
    total = ""
    for tr in table.iter("tr"):
        classes = _classes(tr)
        cells = [cell for cell in tr if isinstance(cell.tag, str)]
        if "plangridyear" in classes:
            year = clean_text(tr.text_content())
            continue
        if "plangridterm" in classes:
            label = clean_text(cells[0].text_content()) if cells else ""
            terms.append(PlanTerm(year=year, term=label, rows=[]))
            continue
        if "plangridtotal" in classes:
            total = clean_text(cells[-1].text_content()) if cells else ""
            continue
        if not cells or "hidden" in classes:
            continue
        if not terms:
            terms.append(PlanTerm(year=year, term="", rows=[]))
        code_cell = next((c for c in cells if "codecol" in _classes(c)), None)
        hours_cell = next((c for c in cells if "hourscol" in _classes(c)), None)
        title_cell = next((c for c in cells if "titlecol" in _classes(c)), None)
        courses, joiner = (
            cell_courses(code_cell) if code_cell is not None else ([], None)
        )
        if "plangridsum" in classes:
            kind: PlanRowKind = "term_total"
        elif courses:
            kind = "course"
        else:
            kind = "comment"
        terms[-1].rows.append(
            PlanRow(
                kind=kind,
                courses=courses,
                joiner=joiner,
                code_text=text_without_footnotes(code_cell)
                if code_cell is not None
                else "",
                title=text_without_footnotes(title_cell)
                if title_cell is not None
                else "",
                hours=text_without_footnotes(hours_cell)
                if hours_cell is not None
                else "",
                footnotes=footnote_markers(tr),
                locator=Locator(xpath=tree.getpath(tr), line=tr.sourceline),
            )
        )
    return terms, total
