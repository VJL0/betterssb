"""A program page's structure: its labeled facts, requirement tables, plan
grids and footnotes, each tied to the tab and headings it sits under.

Undergraduate pages carry Overview / Requirements / Academic Plan tabs (plus
optional ones such as Accelerated Programs or a concentration's own tab);
graduate pages carry Overview / Admission / Program Requirements / Contacts.
Overview paragraphs that begin with a bold label ("Program Code:", "Campus
Locations:", "Delivery:", "Program Format:") are kept as labeled facts.
Requirement prose stays in the page's blocks; nothing here interprets it.
"""

from __future__ import annotations

from lxml import html

from app.modules.bulletin.ingest.extract.document import clean_text
from app.modules.bulletin.ingest.extract.tables import (
    CourseListTable,
    PlanGrid,
    following_footnotes,
    parse_footnotes,
    parse_plan_grid,
    parse_table_rows,
)
from app.modules.bulletin.ingest.records import Evidence, Locator, PageDocument, Record

LABEL_MAX_LENGTH = 60


class LabeledFact(Record):
    label: str
    value: str
    evidence: Evidence


class ProgramPage(Record):
    url: str
    sha256: str
    # Set when the page was read from another snapshot (a PDF volume).
    source_url: str | None = None
    name: str
    level: str
    # Breadcrumb trail above the page (Undergraduate › … › College of …).
    units: list[str]
    facts: list[LabeledFact]
    tables: list[CourseListTable]
    plans: list[PlanGrid]

    def fact(self, label: str) -> str | None:
        return next((f.value for f in self.facts if f.label == label), None)


def _labeled_facts(
    document: html.HtmlElement, url: str, sha256: str
) -> list[LabeledFact]:
    tree = document.getroottree()
    facts = []
    for paragraph in document.xpath('//*[@id="contentarea"]//p[strong]'):
        strong = paragraph.xpath("./strong")[0]
        if (paragraph.text or "").strip():
            continue
        label = clean_text(strong.text_content())
        if not label.endswith(":") or len(label) > LABEL_MAX_LENGTH:
            continue
        text = clean_text(paragraph.text_content())
        facts.append(
            LabeledFact(
                label=label.rstrip(":").strip(),
                value=text[len(label) :].strip(),
                evidence=Evidence(
                    url=url,
                    sha256=sha256,
                    locator=Locator(
                        xpath=tree.getpath(paragraph), line=paragraph.sourceline
                    ),
                    text=text,
                ),
            )
        )
    return facts


def _position(page: PageDocument, xpath: str) -> tuple[list[str], str | None]:
    for block in page.blocks:
        if block.locator.xpath == xpath:
            return block.section, block.locator.tab
    return [], None


def parse_program_page(document: html.HtmlElement, page: PageDocument) -> ProgramPage:
    tree = document.getroottree()
    tables = []
    for index, table in enumerate(
        document.xpath(
            '//*[@id="contentarea"]//table[contains(@class,"sc_courselist")]'
        )
    ):
        xpath = tree.getpath(table)
        section, tab = _position(page, xpath)
        footnote_list = following_footnotes(table)
        tables.append(
            CourseListTable(
                index=index,
                rows=parse_table_rows(table),
                footnotes=(
                    parse_footnotes(footnote_list, page.url, page.sha256)
                    if footnote_list is not None
                    else []
                ),
                section=section,
                tab=tab,
                evidence=Evidence(
                    url=page.url,
                    sha256=page.sha256,
                    locator=Locator(xpath=xpath, line=table.sourceline, tab=tab),
                    text=clean_text(table.text_content())[:500],
                ),
            )
        )
    plans = []
    for index, grid in enumerate(
        document.xpath('//*[@id="contentarea"]//table[contains(@class,"sc_plangrid")]')
    ):
        xpath = tree.getpath(grid)
        section, tab = _position(page, xpath)
        terms, total = parse_plan_grid(grid)
        footnote_list = following_footnotes(grid)
        plans.append(
            PlanGrid(
                index=index,
                section=section,
                tab=tab,
                terms=terms,
                total_hours=total,
                footnotes=(
                    parse_footnotes(footnote_list, page.url, page.sha256)
                    if footnote_list is not None
                    else []
                ),
                evidence=Evidence(
                    url=page.url,
                    sha256=page.sha256,
                    locator=Locator(xpath=xpath, line=grid.sourceline, tab=tab),
                    text=clean_text(grid.text_content())[:500],
                ),
            )
        )
    path_parts = [part for part in page.url.split("/") if part]
    level = "graduate" if "graduate" in path_parts else "undergraduate"
    return ProgramPage(
        url=page.url,
        sha256=page.sha256,
        name=page.heading,
        level=level,
        units=[crumb.text for crumb in page.breadcrumbs[1:-1]],
        facts=_labeled_facts(document, page.url, page.sha256),
        tables=tables,
        plans=plans,
    )
