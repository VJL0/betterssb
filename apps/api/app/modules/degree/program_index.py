"""Parse a Bulletin's academic programs index (`/academic-programs/`)."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from app.modules.degree.bulletin_html import BULLETIN_HOST, clean, full_url, text
from app.modules.degree.schemas import (
    BulletinProgram,
    BulletinProgramIndex,
    CodeName,
    Definition,
    Link,
    ProgramLevel,
)

EDITION_RE = re.compile(r"(\d{4}-\d{4})\s+Edition")
# Index links read "BS", "BS*" or "BA (not currently accepting applications)".
DEGREE_LABEL_RE = re.compile(
    r"^(?P<degree>[^(*^]+?)[*^]*\s*(?:\((?P<note>[^)]*)\))?[*^]*$"
)
# The index marks programs with emphasis or concentration options with * or ^.
OPTIONS_MARK_RE = re.compile(r"[*^]+")
INDEX_LEVEL_COLUMNS = {
    "column1": ProgramLevel.UNDERGRADUATE,
    "column2": ProgramLevel.GRADUATE,
    "column3": ProgramLevel.PROFESSIONAL,
}
INDEX_NAME_COLUMN = "column0"
INDEX_COLLEGE_COLUMN = "column4"
# The key tables follow the headings "Key for Schools and Colleges" and
# "Degree Symbols and Classifications".
_COLLEGE_KEY = "school"
_DEGREE_KEY = "degree"
# A cell can list more than one college ("ST, CO").
_COLLEGE_SEPARATOR = re.compile(r"\s*,\s*")


def bulletin_edition(page_text: str) -> str:
    """The year in a page's "YYYY-YYYY Edition" banner; older archives have none."""
    m = EDITION_RE.search(page_text)
    return m.group(1) if m else ""


def _cell_text(row: Tag, column: str) -> str:
    cell = row.find("td", class_=column)
    return clean(cell.get_text()) if cell else ""


def _cell_entries(cell: Tag) -> list[tuple[str, str]]:
    """A level cell's entries ("BA, BS, Minor") with each one's link; some have no page."""
    entries: list[tuple[str, str]] = []
    label: list[str] = []
    href = ""
    depth = 0

    def flush() -> None:
        nonlocal href
        if entry := clean("".join(label)):
            entries.append((entry, href))
        label.clear()
        href = ""

    for node in cell.children:
        if isinstance(node, Tag) and node.name == "a" and node.get("href"):
            label.append(node.get_text())
            href = node["href"]
            continue
        for char in node.get_text() if isinstance(node, Tag) else str(node):
            depth += (char == "(") - (char == ")")
            if char == "," and depth == 0:
                flush()
            else:
                label.append(char)
    flush()
    return entries


def _key_rows(table: Tag) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for tr in table.select("tbody tr") or table.find_all("tr"):
        cells = [clean(td.get_text()) for td in tr.find_all("td")]
        if len(cells) >= 2 and cells[0]:
            rows.append((cells[0], cells[1]))
    return rows


def _keys(soup: BeautifulSoup) -> tuple[list[CodeName], list[CodeName]]:
    colleges: list[CodeName] = []
    degrees: list[CodeName] = []
    for table in soup.select("table.tbl_keys"):
        heading = table.find_previous(["h2", "h3", "h4", "p"])
        label = text(heading).lower()
        target = (
            colleges
            if _COLLEGE_KEY in label
            else degrees
            if _DEGREE_KEY in label
            else None
        )
        if target is not None:
            target.extend(
                CodeName(code=code, name=name) for code, name in _key_rows(table)
            )
    return colleges, degrees


def parse_program_index(
    html: str, page_url: str, year: str = ""
) -> BulletinProgramIndex:
    """Every program linked from a Bulletin's academic programs table, in its order, with the index's keys.

    Each row is a field of study ("Computer Science") with links per level
    ("BA", "BS", "Minor"), so one row becomes one program per link.
    """
    soup = BeautifulSoup(html, "lxml")
    colleges, degrees = _keys(soup)
    college_names = {c.code.upper(): c.name for c in colleges}
    degree_names = {d.code: d.name for d in degrees}
    programs: list[BulletinProgram] = []
    seen_urls: set[str] = set()

    for row in soup.select("#degree_body tr"):
        raw_name = _cell_text(row, INDEX_NAME_COLUMN)
        name = clean(OPTIONS_MARK_RE.sub("", raw_name))
        college = _cell_text(row, INDEX_COLLEGE_COLUMN)
        college_name = ", ".join(
            college_names.get(code.upper(), "")
            for code in _COLLEGE_SEPARATOR.split(college)
            if code and college_names.get(code.upper())
        )
        for column, level in INDEX_LEVEL_COLUMNS.items():
            cell = row.find("td", class_=column)
            if not cell:
                continue
            for label, href in _cell_entries(cell):
                url = urljoin(page_url, href) if href else ""
                if url and (
                    urlsplit(url).hostname != BULLETIN_HOST or url in seen_urls
                ):
                    continue
                seen_urls.add(url)
                m = DEGREE_LABEL_RE.match(label)
                degree, note = (
                    (m["degree"].strip(), clean(m["note"] or "")) if m else (label, "")
                )
                programs.append(
                    BulletinProgram(
                        name=name,
                        degree=degree,
                        note=note,
                        level=level,
                        college=college,
                        college_name=college_name,
                        degree_name=degree_names.get(degree, ""),
                        has_options=bool(
                            OPTIONS_MARK_RE.search(label)
                            or OPTIONS_MARK_RE.search(raw_name)
                        ),
                        url=url,
                    )
                )
    intro = soup.select_one("#textcontainer")
    return BulletinProgramIndex(
        bulletin_year=year,
        source_url=page_url,
        programs=programs,
        introduction=[
            text(p) for p in (intro.find_all("p") if intro else []) if text(p)
        ],
        links=[
            Link(text=clean(a.get_text()), url=full_url(a["href"]))
            for a in (intro.find_all("a", href=True) if intro else [])
            if clean(a.get_text()) and not a.find_parent(id="degree_body")
        ],
        colleges=colleges,
        degrees=degrees,
        program_types=[
            Definition(term=term, description=description)
            for table in soup.select("table.tbl_programnames")
            for term, description in _key_rows(table)
        ],
    )
