"""Programs: the academic programs index, and each program's page.

A program page's course tables (`sc_courselist`) become requirement trees, and
its academic plan grid (`sc_plangrid`) becomes a suggested plan. The prose
around them (residency, GPA minimums, college requirements) is kept as text on
the program version: it's often a rule, but not one a table expresses.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from app.modules.bulletin.ingest.pages import CONTENT_SELECTOR
from app.modules.bulletin.ingest.rules import (
    COURSE_CODE,
    RuleNodeDraft,
    clean_text,
    course_node,
)
from app.modules.bulletin.models import ParseStatus, ProgramKind, RuleNodeType

PROGRAM_CODE = re.compile(r"Program Code:\s*([A-Z0-9-]+)")
CREDIT_RANGE = re.compile(
    r"(?P<low>[0-9]+(?:\.[0-9]+)?)(?:\s*-\s*(?P<high>[0-9]+(?:\.[0-9]+)?))?"
)
NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}  # fmt: skip
NUMBER = r"(?P<count>[0-9]+|" + "|".join(NUMBER_WORDS) + r")"
SELECT_CREDITS = re.compile(
    r"\b(?P<low>[0-9]+(?:\.[0-9]+)?)(?:\s*-\s*(?P<high>[0-9]+(?:\.[0-9]+)?))?\s*"
    r"(?:credits?|credit hours|s\.h\.)",
    re.IGNORECASE,
)
SELECT_COUNT = re.compile(
    rf"\b(?:select|choose|complete|take)\b\s+(?:at least\s+|any\s+)?{NUMBER}\b(?!\s*(?:credit|s\.h))",
    re.IGNORECASE,
)
SELECT_ONE = re.compile(
    r"\b(?:select|choose)\s+(?:one|this|1)\b|\bone of the following\b|\bchosen from\b",
    re.IGNORECASE,
)
SELECT_ALL = re.compile(
    r"\bmust take\b|\ball of the following\b|\brequired\b", re.IGNORECASE
)
# Section headings that usually name one of several alternatives.
ALTERNATIVE_SECTION = re.compile(
    r"\b(?:sequence|option|track|pathway)\b", re.IGNORECASE
)
MAX_TABLE_NAME_LENGTH = 160
LABEL_NOTE = re.compile(r"\s*\(.*\)$")
TERM = re.compile(r"\b(Fall|Spring|Summer)\b", re.IGNORECASE)
YEAR = re.compile(r"Year\s+([0-9]+)")

# Index link labels, as the academic programs table prints them.
KIND_BY_LABEL = {
    "minor": ProgramKind.MINOR,
    "cert.": ProgramKind.CERTIFICATE,
    "conc.": ProgramKind.CONCENTRATION,
    "conc.*": ProgramKind.CONCENTRATION,
}
KIND_BY_SLUG_SUFFIX = {
    "-minor": ProgramKind.MINOR,
    "-certificate": ProgramKind.CERTIFICATE,
    "-concentration": ProgramKind.CONCENTRATION,
}


@dataclass(slots=True)
class ProgramListing:
    """One undergraduate link in the academic programs index."""

    url: str
    name: str
    label: str
    unit_code: str
    kind: ProgramKind


@dataclass(slots=True)
class ProgramIndex:
    listings: list[ProgramListing]
    unit_names: dict[str, str]
    degree_names: dict[str, str]


@dataclass(slots=True)
class RequirementTable:
    name: str
    tree: RuleNodeDraft
    source_text: str


@dataclass(slots=True)
class PlanItemDraft:
    code_text: str
    title: str
    credits_text: str
    courses: list[tuple[str, str]]


@dataclass(slots=True)
class PlanTermDraft:
    year_number: int
    term: str
    items: list[PlanItemDraft] = field(default_factory=list)
    total_credits_text: str = ""


@dataclass(slots=True)
class PlanDraft:
    name: str
    terms: list[PlanTermDraft]
    total_credits_text: str
    footnotes: list[str]


@dataclass(slots=True)
class ProgramPage:
    name: str
    program_code: str
    overview_text: str
    requirements_text: str
    requirement_tables: list[RequirementTable]
    plans: list[PlanDraft]

    @property
    def parse_status(self) -> ParseStatus:
        if not self.requirement_tables:
            return ParseStatus.RAW
        statuses = {table.tree.tree_status() for table in self.requirement_tables}
        return (
            ParseStatus.COMPLETE
            if statuses == {ParseStatus.COMPLETE}
            else ParseStatus.PARTIAL
        )


def program_slug(url: str) -> str:
    return urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1]


def program_kind(slug: str, label: str) -> ProgramKind:
    if kind := KIND_BY_LABEL.get(label.lower()):
        return kind
    for suffix, kind in KIND_BY_SLUG_SUFFIX.items():
        if slug.endswith(suffix):
            return kind
    return ProgramKind.MAJOR if label else ProgramKind.OTHER


# ── The academic programs index ─────────────────────────────────────────────


def parse_program_index(html: str, base_url: str) -> ProgramIndex:
    soup = BeautifulSoup(html, "lxml")
    key_tables = soup.select("table.tbl_keys")
    unit_names = _key_table(key_tables[0]) if key_tables else {}
    degree_names = _key_table(key_tables[1]) if len(key_tables) > 1 else {}

    listings: list[ProgramListing] = []
    seen: set[str] = set()
    for row in soup.select("table tbody tr"):
        cells = row.find_all("td")
        # Name, undergraduate, graduate, professional, school/college.
        if len(cells) < 5:
            continue
        name = clean_text(cells[0].get_text())
        unit_code = clean_text(cells[-1].get_text())
        for anchor in cells[1].find_all("a", href=True):
            url = urljoin(base_url, anchor["href"])
            if url in seen:
                continue
            seen.add(url)
            # "BM (not currently open for enrollment)": the note isn't the credential.
            label = LABEL_NOTE.sub("", clean_text(anchor.get_text()))
            listings.append(
                ProgramListing(
                    url=url,
                    name=name,
                    label=label,
                    unit_code=unit_code,
                    kind=program_kind(program_slug(url), label),
                )
            )
    return ProgramIndex(listings, unit_names, degree_names)


def _key_table(table: Tag) -> dict[str, str]:
    keys: dict[str, str] = {}
    for row in table.select("tbody tr"):
        cells = [clean_text(cell.get_text()) for cell in row.find_all("td")]
        if len(cells) == 2 and cells[0]:
            keys[cells[0]] = cells[1]
    return keys


# ── A program page ──────────────────────────────────────────────────────────


def parse_program_page(html: str) -> ProgramPage:
    soup = BeautifulSoup(html, "lxml")
    heading = soup.select_one("h1.page-title")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    for hidden in content.select(".hidden.noscript, .sr-only"):
        hidden.decompose()

    overview = soup.select_one("#textcontainer")
    requirements = soup.select_one("#requirementstextcontainer") or overview
    code_match = PROGRAM_CODE.search(content.get_text(" "))
    return ProgramPage(
        name=clean_text(heading.get_text()) if heading else "",
        program_code=code_match[1] if code_match else "",
        overview_text=clean_text(overview.get_text(" ")) if overview else "",
        requirements_text=(
            clean_text(requirements.get_text(" "))
            if requirements is not overview
            else ""
        ),
        requirement_tables=[
            _requirement_table(table) for table in content.select("table.sc_courselist")
        ],
        plans=[_plan(table) for table in content.select("table.sc_plangrid")],
    )


def _preceding_heading(table: Tag) -> str:
    heading = table.find_previous(["h2", "h3", "h4", "h5"])
    return clean_text(heading.get_text(" ")) if heading else ""


def _list_item_context(table: Tag) -> str:
    """The text a table's list item opens with: "Major Requirements (73-74 s.h.)..."."""
    item = table.parent
    if item is None or item.name != "li":
        return ""
    return clean_text(" ".join(item.find_all(string=True, recursive=False)))


def _table_name(table: Tag, context: str) -> str:
    if not context:
        return _preceding_heading(table)
    if len(context) <= MAX_TABLE_NAME_LENGTH:
        return context
    return context[:MAX_TABLE_NAME_LENGTH].rsplit(" ", 1)[0] + "…"


def _footnotes_after(table: Tag) -> list[str]:
    sibling = table.find_next_sibling()
    if (
        sibling is None
        or sibling.name != "dl"
        or "sc_footnotes" not in sibling.get("class", [])
    ):
        return []
    return [clean_text(item.get_text(" ")) for item in sibling.find_all("dd")]


def _credit_bounds(text: str) -> tuple[Decimal | None, Decimal | None]:
    match = CREDIT_RANGE.search(text)
    if not match:
        return None, None
    low = Decimal(match["low"])
    return low, Decimal(match["high"]) if match["high"] else low


# ── Requirement tables ──────────────────────────────────────────────────────


@dataclass(slots=True)
class _Row:
    kind: str  # header, comment, course, total
    text: str
    credits_text: str
    indented: bool
    is_or: bool
    courses: list[tuple[str, str]]
    footnotes: list[str]


def _table_rows(table: Tag) -> list[_Row]:
    rows: list[_Row] = []
    for tr in table.select("tr"):
        classes = tr.get("class", [])
        cells = tr.find_all("td")
        if not cells:
            continue
        markers = [clean_text(sup.extract().get_text()) for sup in tr.select("sup")]
        code_cell = tr.select_one("td.codecol")
        credits_cell = tr.select_one("td.hourscol")
        credits_text = clean_text(credits_cell.get_text()) if credits_cell else ""
        text = clean_text(
            " ".join(c.get_text(" ") for c in cells if c is not credits_cell)
        )
        courses = (
            COURSE_CODE.findall(clean_text(code_cell.get_text(" ")))
            if code_cell
            else []
        )
        if "listsum" in classes:
            kind = "total"
        elif courses:
            kind = "course"
        elif "areaheader" in classes and not tr.select_one(
            ".commentindent, .blockindent"
        ):
            kind = "header"
        else:
            kind = "comment"
        rows.append(
            _Row(
                kind=kind,
                text=text,
                credits_text=credits_text,
                indented=tr.select_one(".blockindent, .commentindent") is not None,
                is_or="orclass" in classes
                or bool(code_cell and "orclass" in code_cell.get("class", [])),
                courses=courses,
                footnotes=[marker for marker in markers if marker],
            )
        )
    return rows


def _selection_node(text: str, credits_text: str) -> RuleNodeDraft:
    """The node a comment row like "Select 15-16 credits from:" opens."""
    if match := SELECT_CREDITS.search(text):
        low = Decimal(match["low"])
        return RuleNodeDraft(
            RuleNodeType.CREDITS,
            label=text,
            source_text=text,
            min_credits=low,
            max_credits=Decimal(match["high"]) if match["high"] else low,
        )
    if (match := SELECT_COUNT.search(text)) and match["count"].lower() not in (
        "one",
        "1",
    ):
        count = match["count"].lower()
        return RuleNodeDraft(
            RuleNodeType.COUNT,
            label=text,
            source_text=text,
            min_count=int(count) if count.isdigit() else NUMBER_WORDS[count],
        )
    if SELECT_ONE.search(text) or SELECT_COUNT.search(text):
        return RuleNodeDraft(
            RuleNodeType.ANY, label=text, source_text=text, min_count=1
        )
    if SELECT_ALL.search(text):
        return RuleNodeDraft(RuleNodeType.ALL, label=text, source_text=text)
    # Wording the parser doesn't know; its rows are kept beneath it.
    node = RuleNodeDraft(
        RuleNodeType.SECTION,
        label=text,
        source_text=text,
        parse_status=ParseStatus.PARTIAL,
    )
    low, high = _credit_bounds(credits_text)
    node.min_credits, node.max_credits = low, high
    return node


def _row_item(row: _Row) -> RuleNodeDraft:
    nodes = [course_node(subject, number, row.text) for subject, number in row.courses]
    if len(nodes) == 1:
        item = nodes[0]
    else:
        # "CHEM 1031 & CHEM 1033": taken together.
        item = RuleNodeDraft(
            RuleNodeType.ALL, label=row.text, source_text=row.text, children=nodes
        )
    if row.credits_text:
        item.params["credits_text"] = row.credits_text
    if row.footnotes:
        item.params["footnotes"] = row.footnotes
    return item


def _add_alternative(parent: RuleNodeDraft, item: RuleNodeDraft) -> None:
    """An "or CIS 1951" row: one more way to meet the parent's last item."""
    if not parent.children:
        parent.children.append(item)
        return
    previous = parent.children[-1]
    if previous.node_type is RuleNodeType.ANY and previous.params.get("alternatives"):
        previous.children.append(item)
        return
    parent.children[-1] = RuleNodeDraft(
        RuleNodeType.ANY,
        label=f"{previous.label} or {item.label}",
        source_text=f"{previous.source_text} | {item.source_text}",
        children=[previous, item],
        params={"alternatives": True},
    )


def _next_course_row_is_indented(rows: list[_Row], start: int) -> bool:
    for row in rows[start:]:
        if row.kind == "course":
            return row.indented
        if row.kind in ("header", "comment"):
            return False
    return False


def build_requirement_tree(rows: list[_Row], name: str) -> RuleNodeDraft:
    root = RuleNodeDraft(RuleNodeType.ALL, label=name, source_text=name)
    section = root
    choice: RuleNodeDraft | None = None
    # A choice either takes the indented rows under it or, when the table
    # doesn't indent, every course row until the next comment or heading.
    choice_takes_indented = False
    for index, row in enumerate(rows):
        if row.kind == "total":
            root.params["total_credits_text"] = row.credits_text
        elif row.kind == "header":
            section = RuleNodeDraft(
                RuleNodeType.SECTION, label=row.text, source_text=row.text
            )
            if ALTERNATIVE_SECTION.search(row.text):
                section.parse_status = ParseStatus.PARTIAL
                section.params["may_be_alternatives"] = True
            root.children.append(section)
            choice = None
        elif row.kind == "comment":
            choice = _selection_node(row.text, row.credits_text)
            if row.credits_text:
                choice.params["credits_text"] = row.credits_text
            section.children.append(choice)
            choice_takes_indented = _next_course_row_is_indented(rows, index + 1)
        else:
            item = _row_item(row)
            if choice is not None and choice_takes_indented and not row.indented:
                choice = None
            parent = choice or section
            if row.is_or:
                _add_alternative(parent, item)
            else:
                parent.children.append(item)

    for node in root.walk():
        if node.node_type is RuleNodeType.SECTION and not node.children:
            # A comment row that's a requirement in words ("Two laboratory
            # science courses", 8 credits) rather than a heading over rows.
            node.node_type = RuleNodeType.TEXT
            node.parse_status = ParseStatus.RAW
    return root


def _requirement_table(table: Tag) -> RequirementTable:
    context = _list_item_context(table)
    name = _table_name(table, context)
    tree = build_requirement_tree(_table_rows(table), name)
    if context:
        tree.params["context"] = context
    if footnotes := _footnotes_after(table):
        tree.params["footnotes"] = footnotes
    return RequirementTable(
        name=name, tree=tree, source_text=clean_text(table.get_text(" "))
    )


# ── Suggested plans ─────────────────────────────────────────────────────────


def _plan(table: Tag) -> PlanDraft:
    terms: list[PlanTermDraft] = []
    year_number = 0
    total = ""
    for tr in table.select("tr"):
        classes = tr.get("class", [])
        credits_cell = tr.select_one("td.hourscol")
        credits_text = clean_text(credits_cell.get_text()) if credits_cell else ""
        if "plangridyear" in classes:
            if match := YEAR.search(tr.get_text(" ")):
                year_number = int(match[1])
        elif "plangridterm" in classes:
            if match := TERM.search(tr.get_text(" ")):
                terms.append(PlanTermDraft(year_number, match[1].capitalize()))
        elif "plangridsum" in classes:
            if terms:
                terms[-1].total_credits_text = credits_text
        elif "plangridtotal" in classes:
            total = credits_text
        elif terms and (code_cell := tr.select_one("td.codecol")):
            title_cell = tr.select_one("td.titlecol")
            code_text = clean_text(code_cell.get_text(" "))
            terms[-1].items.append(
                PlanItemDraft(
                    code_text=code_text,
                    title=clean_text(title_cell.get_text(" ")) if title_cell else "",
                    credits_text=credits_text,
                    courses=COURSE_CODE.findall(code_text),
                )
            )
    return PlanDraft(
        name=_preceding_heading(table),
        terms=terms,
        total_credits_text=total,
        footnotes=_footnotes_after(table),
    )
