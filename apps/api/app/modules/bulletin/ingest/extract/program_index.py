"""The Academic Programs Chart (`/academic-programs/`).

Each row names a program area and lists, per level (Undergraduate, Graduate,
Professional), the credentials Temple awards in it, usually as links to their
pages ("BS", "Minor", "Cert.", "PhD (not currently accepting applications)").
An asterisk or caret marks a program with option areas. Some credentials are
listed without a page ("Medicine Combination PhD/MD"); they're kept, since the
chart is Temple's official list of active programs.

Two key tables follow: school/college codes and degree symbols.
"""

from __future__ import annotations

import re
from typing import Literal

from lxml import html

from app.modules.bulletin.ingest.extract.document import clean_text
from app.modules.bulletin.ingest.records import Evidence, Locator, Record
from app.modules.bulletin.ingest.urls import normalize_url

Level = Literal["undergraduate", "graduate", "professional"]
LEVEL_COLUMNS: dict[str, Level] = {
    "column1": "undergraduate",
    "column2": "graduate",
    "column3": "professional",
}
UNIT_COLUMN = "column4"
STATUS_NOTE = re.compile(r"\(([^)]*)\)")
OPTION_MARKERS = "*^"


class ProgramListing(Record):
    area: str
    level: Level
    # The credential as printed, without option markers or status notes.
    credential: str
    label: str
    # Notes in parentheses: "not currently accepting applications", "thesis".
    notes: list[str]
    has_options: bool
    url: str | None
    unit_code: str
    evidence: Evidence


class ProgramIndex(Record):
    listings: list[ProgramListing]
    unit_names: dict[str, str]
    credential_names: dict[str, str]


def _split_label(label: str) -> tuple[str, list[str], bool]:
    notes = [clean_text(note) for note in STATUS_NOTE.findall(label)]
    bare = clean_text(STATUS_NOTE.sub("", label))
    has_options = any(marker in bare for marker in OPTION_MARKERS)
    return bare.strip(OPTION_MARKERS + " "), notes, has_options


def _cell_items(cell: html.HtmlElement) -> list[tuple[str, str | None]]:
    """A cell's credentials: (label, href), split at links and line breaks."""
    items: list[tuple[str, str | None]] = []
    current_text: list[str] = [cell.text or ""]
    current_href: str | None = None

    def flush() -> None:
        nonlocal current_text, current_href
        text = clean_text("".join(current_text))
        if text:
            items.append((text, current_href))
        current_text, current_href = [], None

    for child in cell:
        if not isinstance(child.tag, str):
            current_text.append(child.tail or "")
            continue
        if child.tag == "a":
            flush()
            current_href = child.get("href")
            current_text = [child.text_content()]
        elif child.tag == "br":
            flush()
        else:
            current_text.append(child.text_content())
        current_text.append(child.tail or "")
    flush()
    return items


def _key_table(table: html.HtmlElement) -> dict[str, str]:
    keys = {}
    for row in table.xpath(".//tbody/tr"):
        cells = row.xpath("./td")
        if len(cells) >= 2:
            keys[clean_text(cells[0].text_content())] = clean_text(
                cells[1].text_content()
            )
    return keys


def parse_program_index(
    document: html.HtmlElement, url: str, sha256: str
) -> ProgramIndex:
    tree = document.getroottree()
    listings = []
    for row in document.xpath('//tbody[@id="degree_body"]/tr'):
        cells = {cell.get("class"): cell for cell in row.xpath("./td")}
        area = clean_text(cells["column0"].text_content()) if "column0" in cells else ""
        unit_code = (
            clean_text(cells[UNIT_COLUMN].text_content())
            if UNIT_COLUMN in cells
            else ""
        )
        for column, level in LEVEL_COLUMNS.items():
            if column not in cells:
                continue
            for label, href in _cell_items(cells[column]):
                credential, notes, has_options = _split_label(label)
                listings.append(
                    ProgramListing(
                        area=area,
                        level=level,
                        credential=credential,
                        label=label,
                        notes=notes,
                        has_options=has_options,
                        url=normalize_url(href, url) if href else None,
                        unit_code=unit_code,
                        evidence=Evidence(
                            url=url,
                            sha256=sha256,
                            locator=Locator(
                                xpath=tree.getpath(row), line=row.sourceline
                            ),
                            text=clean_text(row.text_content()),
                        ),
                    )
                )
    key_tables = document.xpath('//table[contains(@class,"tbl_keys")]')
    return ProgramIndex(
        listings=listings,
        unit_names=_key_table(key_tables[0]) if key_tables else {},
        credential_names=_key_table(key_tables[1]) if len(key_tables) > 1 else {},
    )
