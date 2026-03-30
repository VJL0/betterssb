from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from app.domains.degree.schemas import (
    CourseOption,
    CourseRef,
    DegreeProgram,
    LabScienceSequence,
    PlanSemester,
    PlanYear,
    RequirementCategory,
    RequirementGroup,
    RequirementItem,
    SelectionType,
    SuggestedPlan,
)

BULLETIN_BASE = "https://bulletin.temple.edu"
COURSE_CODE_RE = re.compile(r"([A-Z]{2,5})\s+(\d{3,5}[A-Z]?)")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _extract_course_code(text: str) -> tuple[str, str] | None:
    m = COURSE_CODE_RE.search(text)
    return (m.group(1), m.group(2)) if m else None


def _parse_credits(text: str) -> float | None:
    text = text.strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _full_url(href: str) -> str:
    if not href:
        return ""
    return href if href.startswith("http") else f"{BULLETIN_BASE}{href}"


def _ref_from_link(tag: Tag, title_text: str = "", credits: float | None = None) -> CourseRef:
    title_attr = tag.get("title", "")
    href = tag.get("href", "")
    parts = _extract_course_code(title_attr)
    subject, number = parts if parts else ("", title_attr)
    return CourseRef(
        subject=subject,
        number=number,
        title=_clean(title_text),
        credits=credits,
        bulletin_url=_full_url(href),
    )


# ---------------------------------------------------------------------------
# Table row extraction
# ---------------------------------------------------------------------------


class _TableRow:
    __slots__ = (
        "is_area_header",
        "is_orclass",
        "is_comment",
        "is_total",
        "code_text",
        "title_text",
        "credits_text",
        "links",
        "indented",
    )

    def __init__(self) -> None:
        self.is_area_header = False
        self.is_orclass = False
        self.is_comment = False
        self.is_total = False
        self.code_text = ""
        self.title_text = ""
        self.credits_text = ""
        self.links: list[Tag] = []
        self.indented = False


def _parse_table_rows(table: Tag) -> list[_TableRow]:
    rows: list[_TableRow] = []
    for tr in table.find_all("tr", recursive=False) or table.select("tbody > tr"):
        cls = " ".join(tr.get("class", []))
        row = _TableRow()
        row.is_area_header = "areaheader" in cls
        row.is_orclass = "orclass" in cls
        row.is_total = "listsum" in cls

        for td in tr.find_all("td", recursive=False):
            td_cls = " ".join(td.get("class", []))
            colspan = int(td.get("colspan", 1))

            if "codecol" in td_cls:
                row.code_text = _clean(td.get_text())
                row.links = td.find_all("a", class_="bubblelink")
                if td.find("div", class_="blockindent"):
                    row.indented = True
            elif "hourscol" in td_cls:
                row.credits_text = _clean(td.get_text())
            else:
                row.title_text = _clean(td.get_text())

            if colspan >= 2 and "codecol" not in td_cls:
                row.is_comment = True
                if not row.code_text:
                    row.code_text = _clean(td.get_text())

        if tr.find("span", class_="courselistcomment"):
            row.is_comment = True

        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Requirement group builder
# ---------------------------------------------------------------------------


def _build_groups(rows: list[_TableRow]) -> list[RequirementGroup]:
    groups: list[RequirementGroup] = []
    current = RequirementGroup(name="General", items=[])
    pending: RequirementItem | None = None

    def _flush_pending() -> None:
        nonlocal pending
        if pending:
            current.items.append(pending)
            pending = None

    for row in rows:
        if row.is_total:
            continue

        code = _clean(row.code_text)
        title = _clean(row.title_text)
        credits = _parse_credits(row.credits_text)
        credits_range = row.credits_text if "-" in row.credits_text else ""

        # --- area header (new group) ---
        if row.is_area_header and not row.links:
            _flush_pending()
            if current.items:
                groups.append(current)
            current = RequirementGroup(name=title or code, items=[])
            continue

        # --- or-class alternative ---
        if row.is_orclass and row.links:
            target = pending or (current.items[-1] if current.items else None)
            if target and target.selection_type in (SelectionType.REQUIRED, SelectionType.SELECT_ONE):
                target.selection_type = SelectionType.SELECT_ONE
                ref = _ref_from_link(row.links[0], title)
                target.options.append(CourseOption(courses=[ref], is_honors_variant="honors" in title.lower()))
            continue

        # --- comment row (selection instruction) ---
        if row.is_comment and not row.links:
            _flush_pending()
            comment = title or code
            if "select" in comment.lower():
                sel = SelectionType.SELECT_N if "credit" in comment.lower() else SelectionType.SELECT_ONE
                pending = RequirementItem(
                    selection_type=sel,
                    description=comment,
                    credits=credits,
                    credits_range=credits_range or (row.credits_text.strip() if credits else ""),
                )
            continue

        # --- course row ---
        if row.links:
            if pending and not row.indented and credits is not None:
                _flush_pending()

            option = _option_from_links(row.links, title, credits)

            if pending:
                pending.options.append(option)
            else:
                item = RequirementItem(
                    selection_type=SelectionType.REQUIRED,
                    credits=credits,
                    options=[option],
                )
                current.items.append(item)

    _flush_pending()
    if current.items:
        groups.append(current)

    return groups


def _option_from_links(links: list[Tag], title_text: str, credits: float | None) -> CourseOption:
    if len(links) > 1:
        refs = [_ref_from_link(a, "") for a in links]
        for ref in refs:
            if not ref.title:
                ref.title = title_text
        return CourseOption(courses=refs)

    ref = _ref_from_link(links[0], title_text, credits)
    ref.writing_intensive = "(wi)" in title_text.lower() or "writing" in title_text.lower()
    return CourseOption(courses=[ref], is_honors_variant="honors" in title_text.lower())


# ---------------------------------------------------------------------------
# Lab science sequences
# ---------------------------------------------------------------------------


def _parse_lab_sequences(rows: list[_TableRow]) -> list[LabScienceSequence]:
    sequences: list[LabScienceSequence] = []
    current: LabScienceSequence | None = None
    filling = ""

    for row in rows:
        if row.is_total:
            continue
        title = _clean(row.title_text) or _clean(row.code_text)
        lower = title.lower()

        if row.is_area_header and not row.links:
            if "sequence" in lower or (
                any(d in lower for d in ("biology", "chemistry", "physics", "earth")) and "select" not in lower
            ):
                if current:
                    sequences.append(current)
                current = LabScienceSequence(department=title)
                filling = ""
                continue

            if current and "science a" in lower:
                filling = "a"
                current.science_a_label = title
                continue
            if current and "science b" in lower:
                filling = "b"
                current.science_b_label = title
                continue

        if current and row.links and not row.is_area_header:
            option = _option_from_links(row.links, title, None)
            if filling == "a":
                current.science_a_options.append(option)
            elif filling == "b":
                current.science_b_options.append(option)

    if current:
        sequences.append(current)
    return sequences


# ---------------------------------------------------------------------------
# Footnote extraction
# ---------------------------------------------------------------------------


def _extract_footnotes(container: Tag) -> list[str]:
    notes: list[str] = []
    for dl in container.find_all("dl", class_="sc_footnotes"):
        for dd in dl.find_all("dd"):
            text = _clean(dd.get_text())
            if text:
                notes.append(text)
    return notes


# ---------------------------------------------------------------------------
# Suggested plan
# ---------------------------------------------------------------------------


def _parse_plan(container: Tag) -> SuggestedPlan:
    plan = SuggestedPlan(years=[], footnotes=_extract_footnotes(container))

    table = container.find("table", class_="sc_plangrid")
    if not table:
        return plan

    total_row = table.find("tr", class_="plangridtotal")
    if total_row:
        hours_td = total_row.find("td", class_="hourscol")
        if hours_td:
            plan.total_credits = _clean(hours_td.get_text())

    current_year: PlanYear | None = None
    current_sem: PlanSemester | None = None

    for tr in table.find_all("tr"):
        cls = " ".join(tr.get("class", []))

        if "plangridyear" in cls:
            text = _clean(tr.get_text())
            m = re.search(r"Year\s+(\d+)", text)
            if m:
                current_year = PlanYear(year=int(m.group(1)), semesters=[])
                plan.years.append(current_year)

        elif "plangridterm" in cls:
            text = _clean(tr.get_text())
            m = re.search(r"(Fall|Spring|Summer)", text, re.IGNORECASE)
            if m and current_year is not None:
                current_sem = PlanSemester(term=m.group(1).capitalize(), courses=[])  # type: ignore[arg-type]
                current_year.semesters.append(current_sem)

        elif "plangridsum" in cls and current_sem is not None:
            hours_td = tr.find("td", class_="hourscol")
            if hours_td:
                current_sem.total_credits = _clean(hours_td.get_text())

    return plan


# ---------------------------------------------------------------------------
# Table classification
# ---------------------------------------------------------------------------


def _classify_tables(tables: list[Tag]) -> tuple[Tag | None, Tag | None, Tag | None]:
    """Return (writing_intensive_table, main_requirements_table, lab_science_table)."""
    main: Tag | None = None
    lab: Tag | None = None
    wi: Tag | None = None

    for t in tables:
        headers = [_clean(span.get_text()) for span in t.find_all("span", class_="areaheader")]
        joined = " ".join(headers).lower()

        if any(kw in joined for kw in ("computer", "mathematics", "elective", "science course")):
            main = t
        elif any(kw in joined for kw in ("sequence", "biology", "chemistry", "physics")):
            lab = t
        elif wi is None:
            wi = t

    return wi, main, lab


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------


class BulletinParser:
    """Parses a saved Temple University Bulletin HTML page into a DegreeProgram."""

    def parse(self, html: str, url: str = "") -> DegreeProgram:
        soup = BeautifulSoup(html, "lxml")
        program = DegreeProgram(name="", bulletin_url=url)

        title_tag = soup.find("title")
        if title_tag:
            program.name = _clean(title_tag.get_text()).split("|")[0].strip()

        program.program_code = self._extract_program_code(soup)
        program.bulletin_year = self._extract_bulletin_year(soup)
        program.degree_type = self._extract_degree_type(soup)
        program.college = self._extract_college(soup)
        program.distinction_criteria = self._extract_distinction(soup)

        req_div = soup.find("div", id="requirementstextcontainer")
        if not req_div:
            return program

        program.footnotes = _extract_footnotes(req_div)

        tables = req_div.find_all("table", class_="sc_courselist")
        wi_table, main_table, lab_table = _classify_tables(tables)

        if wi_table:
            rows = _parse_table_rows(wi_table)
            groups = _build_groups(rows)
            if groups:
                program.categories.append(
                    RequirementCategory(
                        name="Writing-Intensive Courses",
                        groups=groups,
                    )
                )

        if main_table:
            rows = _parse_table_rows(main_table)
            groups = _build_groups(rows)

            total_credits = ""
            req_text = req_div.get_text()
            m = re.search(r"Major Requirements.*?\((\d[\d\-]+)\s*s\.h\.\)", req_text)
            if m:
                total_credits = m.group(1)

            program.categories.append(
                RequirementCategory(
                    name="Major Requirements",
                    total_credits=total_credits,
                    groups=groups,
                )
            )
            program.total_credits = total_credits

        if lab_table:
            rows = _parse_table_rows(lab_table)
            program.lab_science_sequences = _parse_lab_sequences(rows)

        plan_div = soup.find("div", id="academicplantextcontainer")
        if plan_div:
            program.suggested_plan = _parse_plan(plan_div)

        return program

    # --- private helpers ---

    @staticmethod
    def _extract_program_code(soup: BeautifulSoup) -> str:
        text = soup.get_text()
        m = re.search(r"Program Code:\s*([\w\-]+)", text)
        return m.group(1).strip() if m else ""

    @staticmethod
    def _extract_bulletin_year(soup: BeautifulSoup) -> str:
        m = re.search(r"(\d{4}-\d{4})\s+Edition", soup.get_text())
        return m.group(1) if m else ""

    @staticmethod
    def _extract_degree_type(soup: BeautifulSoup) -> str:
        text = soup.get_text()
        if "Bachelor of Science" in text:
            return "BS"
        if "Bachelor of Arts" in text:
            return "BA"
        return ""

    @staticmethod
    def _extract_college(soup: BeautifulSoup) -> str:
        for li in soup.find_all("li", class_="isparent"):
            if "active" not in (li.get("class") or []):
                continue
            a = li.find("a", recursive=False)
            if not a:
                continue
            text = _clean(a.get_text())
            if text.startswith(("College of", "School of")):
                return text
        return ""

    @staticmethod
    def _extract_distinction(soup: BeautifulSoup) -> list[str]:
        h3 = soup.find("h3", string=re.compile(r"Distinction in Major"))
        if not h3:
            return []
        items: list[str] = []
        ul = h3.find_next_sibling("ul")
        if ul:
            for li in ul.find_all("li"):
                items.append(_clean(li.get_text()))
        return items
