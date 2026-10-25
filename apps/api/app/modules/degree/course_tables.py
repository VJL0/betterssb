"""Parse CourseLeaf course lists (table.sc_courselist) and plan grids (table.sc_plangrid).

A course list is a run of rows:
  - area header rows start a group ("Computer Science Electives"), or
    when indented, a sub-heading such as "Select one Biology Lab Science A:"
  - comment rows give a selection ("Select two of the following:") or a note
  - course rows link one course, or corequisites joined with "&"; rows
    indented under a selection are its options
  - "or" rows give an alternative to the row above
  - a total row ends the list ("Total Credit Hours 73-74")
Footnote markers (<sup>) on any row point into the list's footnotes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import NavigableString, Tag

from app.modules.degree.bulletin_html import (
    COURSE_CODE_RE,
    clean,
    full_url,
    lines,
    text,
)
from app.modules.degree.schemas import (
    CourseOption,
    CourseRef,
    LabScienceSequence,
    PlanCourse,
    PlanSemester,
    PlanYear,
    RequirementGroup,
    RequirementItem,
    SelectionType,
    SuggestedPlan,
)

# Attribute codes in titles: "Analytical Reading and Writing [GW]".
_ATTRIBUTE_RE = re.compile(r"\s*\[([A-Z]{2,3})\]")
_WRITING_INTENSIVE = "WI"
_SELECTION_RE = re.compile(r"\b(select|choose|chosen)\b", re.IGNORECASE)
# A line ending in ":" introduces the course under it ("All students MUST take:").
_LEAD_IN_END = ":"
_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
_NUMBER = rf"(\d+|{'|'.join(_NUMBER_WORDS)})"
_CREDIT_WORDS = r"(?:credits?|credit hours|semester hours|s\.h\.)"
# "Select two of the following" → 2; not "Select 15-16 credits".
_CHOOSE_COUNT_RE = re.compile(
    rf"\b(?:select|choose)\s+(?:at\s+least\s+|at\s+most\s+|any\s+)?{_NUMBER}\b(?![\d-]*\s*{_CREDIT_WORDS})",
    re.IGNORECASE,
)
# "Select 15-16 credits" → "15-16"; "Select at most six credits" → "6".
_CHOOSE_CREDITS_RE = re.compile(
    rf"{_NUMBER}(?:\s*-\s*(\d+))?\s+{_CREDIT_WORDS}", re.IGNORECASE
)
_NOTE_PREFIX = "note"
# A header row can carry the list's total: "Total Credits for the BSArch in Architecture: 123".
_TOTAL_PREFIX = "total"
_HONORS = "honors"
_OR = "or"
_AND = "&"
_INDENTED = "blockindent"


@dataclass
class _Row:
    kind: str  # "header", "comment", "course", "or" or "total"
    text: str = ""
    title_lines: list[str] = field(default_factory=list)
    credits: str = ""
    indented: bool = False
    links: list[Tag] = field(default_factory=list)
    footnotes: list[str] = field(default_factory=list)
    attributes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


def _rows(table: Tag) -> list[_Row]:
    rows: list[_Row] = []
    for tr in table.select("tbody > tr") or table.find_all("tr"):
        classes = tr.get("class") or []
        if "hidden" in classes or tr.find("th"):
            continue
        cells = tr.find_all("td", recursive=False)
        code_cell = tr.find("td", class_="codecol")
        hours_cell = tr.find("td", class_="hourscol")
        others = [td for td in cells if td is not code_cell and td is not hours_cell]
        row = _Row(
            kind="course",
            credits=_credit_text(hours_cell),
            footnotes=_sups(tr)[0],
            attributes=_sups(tr)[1],
            indented=_is_indented(code_cell)
            or tr.select_one("span.commentindent") is not None,
        )
        if "listsum" in classes:
            row.kind = "total"
        elif "areaheader" in classes:
            row.kind = "header"
            row.text = text(others[0] if others else tr, skip_sup=True)
        elif code_cell is not None and (links := code_cell.select("a.bubblelink")):
            row.kind = "or" if "orclass" in classes else "course"
            row.links = links
            row.title_lines = _title_lines(others[0] if others else None)
        elif code_cell is not None and code_cell.get("colspan") is None:
            # A code with no course page, such as "CIS 4X9X".
            row.text = text(code_cell, skip_sup=True)
            row.title_lines = _title_lines(others[0] if others else None)
            if not row.text:
                continue
        else:
            row.kind = "comment"
            row.text = text(code_cell or (others[0] if others else tr), skip_sup=True)
        rows.append(row)
    return rows


def _is_indented(code_cell: Tag | None) -> bool:
    """A row under a selection wraps its whole code cell in an indented div."""
    if code_cell is None:
        return False
    first = code_cell.find(True, recursive=False)
    return (
        first is not None
        and first.name == "div"
        and _INDENTED in (first.get("class") or [])
    )


def _title_lines(cell: Tag | None) -> list[str]:
    """A title cell's titles, one per course; corequisite titles follow an "and"."""
    titles = (
        re.sub(r"^(?:and|&)\b\s*", "", line, flags=re.IGNORECASE)
        for line in lines(cell, skip_sup=True)
    )
    return [title for title in titles if title]


def _course_ref(link: Tag, title: str, credits: str) -> CourseRef:
    code = clean(link.get("title") or link.get_text())
    match = COURSE_CODE_RE.search(code)
    subject, number = match.groups() if match else ("", code)
    attributes = _ATTRIBUTE_RE.findall(title)
    return CourseRef(
        subject=subject,
        number=number,
        title=_ATTRIBUTE_RE.sub("", title).strip(),
        credits=_credits(credits),
        attributes=attributes,
        writing_intensive=_WRITING_INTENSIVE in attributes or "(wi)" in title.lower(),
        bulletin_url=full_url(link.get("href") or ""),
    )


def _row_option(row: _Row) -> CourseOption:
    """A course row's option: its course, or corequisites taken together."""
    if not row.links:
        return CourseOption(courses=[], description=row.text)
    titles = row.title_lines or [""]
    courses = [
        _course_ref(
            link,
            titles[min(i, len(titles) - 1)],
            row.credits if len(row.links) == 1 else "",
        )
        for i, link in enumerate(row.links)
    ]
    for course in courses:
        course.attributes.extend(
            a for a in row.attributes if a not in course.attributes
        )
    return CourseOption(
        courses=courses,
        is_honors_variant=any(_HONORS in t.lower() for t in titles),
    )


def _credits(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Selections
# ---------------------------------------------------------------------------


def _is_selection(text_: str) -> bool:
    return bool(_SELECTION_RE.search(text_))


def _selection_item(text_: str, credits: str, footnotes: list[str]) -> RequirementItem:
    count_match = _CHOOSE_COUNT_RE.search(text_)
    credits_match = _CHOOSE_CREDITS_RE.search(text_)
    count = _number(count_match.group(1)) if count_match else None
    choose_credits = ""
    if credits_match:
        low = _number(credits_match.group(1))
        choose_credits = (
            f"{low}-{credits_match.group(2)}" if credits_match.group(2) else str(low)
        )
    many = bool(choose_credits) or (count is not None and count > 1)
    return RequirementItem(
        selection_type=SelectionType.SELECT_N if many else SelectionType.SELECT_ONE,
        description=text_,
        credits=_credits(credits),
        credits_range=credits if "-" in credits else "",
        choose_count=count,
        choose_credits=choose_credits,
        footnotes=footnotes,
    )


def _number(word: str) -> int:
    return int(word) if word.isdigit() else _NUMBER_WORDS[word.lower()]


# ---------------------------------------------------------------------------
# Course lists
# ---------------------------------------------------------------------------


def parse_course_list(
    table: Tag, footnotes: dict[str, str]
) -> tuple[list[RequirementGroup], str]:
    """A course list's groups and its total credits ("" when it has no total row)."""
    groups: list[RequirementGroup] = []
    current = RequirementGroup(name="", items=[])
    pending: RequirementItem | None = None
    total = ""

    def resolve(numbers: list[str]) -> list[str]:
        return [footnotes[n] for n in numbers if n in footnotes]

    def flush_pending() -> None:
        nonlocal pending
        if pending is not None:
            current.items.append(pending)
            pending = None

    lead_in = ""

    def drop_lead_in() -> None:
        nonlocal lead_in
        if lead_in:
            current.constraints.append(lead_in)
            lead_in = ""

    def close_group() -> None:
        flush_pending()
        drop_lead_in()
        if current.items or current.constraints:
            groups.append(current)

    rows = _rows(table)
    subheading = ""
    for index, row in enumerate(rows):
        notes = resolve(row.footnotes)
        following = rows[index + 1] if index + 1 < len(rows) else None
        if row.kind == "total" or (
            row.kind == "header"
            and row.credits
            and row.text.lower().startswith(_TOTAL_PREFIX)
        ):
            total = row.credits
        elif row.kind == "header" and not row.indented:
            close_group()
            current = RequirementGroup(
                name=row.text, credits=row.credits, items=[], constraints=notes
            )
        elif row.kind in ("comment", "header"):
            drop_lead_in()
            if _is_selection(row.text):
                flush_pending()
                pending = _selection_item(row.text, row.credits, notes)
                subheading = ""
            elif row.credits and not row.text.lower().startswith(_NOTE_PREFIX):
                # A line with credits is a requirement in words ("Two (2) laboratory science courses", 8).
                flush_pending()
                current.items.append(
                    RequirementItem(
                        selection_type=SelectionType.REQUIRED,
                        description=row.text,
                        credits=_credits(row.credits),
                        credits_range=row.credits if "-" in row.credits else "",
                        footnotes=notes,
                    )
                )
            elif pending is None and row.text.endswith(_LEAD_IN_END) and not notes:
                lead_in = row.text
            elif row.text.lower().startswith(_NOTE_PREFIX) or pending is None:
                flush_pending()
                current.constraints.extend([row.text, *notes])
            elif (
                following is not None and following.kind == "course" and following.links
            ):
                # A subject line ("Anthropology") heads the courses listed under it.
                subheading = row.text
            else:
                pending.options.append(CourseOption(courses=[], description=row.text))
                pending.footnotes.extend(notes)
        elif row.kind == "or":
            target = pending or (current.items[-1] if current.items else None)
            if target is None:
                continue
            if target.selection_type == SelectionType.REQUIRED:
                target.selection_type = SelectionType.SELECT_ONE
            option = _row_option(row)
            option.group = subheading if target is pending else ""
            target.options.append(option)
            target.footnotes.extend(notes)
        else:
            option = _row_option(row)
            # A selection collects the rows under it until one stands on its own with credits;
            # a selection line without credits ("…can be chosen from:") collects every course row after it.
            if pending is not None and (
                row.indented or not row.credits or pending.credits is None
            ):
                option.group = subheading
                pending.options.append(option)
                pending.footnotes.extend(notes)
                continue
            flush_pending()
            current.items.append(
                RequirementItem(
                    selection_type=SelectionType.REQUIRED,
                    description=lead_in,
                    credits=_credits(row.credits),
                    credits_range=row.credits if "-" in row.credits else "",
                    options=[option],
                    footnotes=notes,
                )
            )
            lead_in = ""
    close_group()
    for group in groups:
        for item in group.items:
            item.footnotes = list(dict.fromkeys(item.footnotes))
    return groups, total


def is_lab_sequence_table(table: Tag) -> bool:
    headers = [row.text.lower() for row in _rows(table) if row.kind == "header"]
    return any("sequence" in h for h in headers) and any(
        "science a" in h for h in headers
    )


def parse_lab_sequences(
    table: Tag, footnotes: dict[str, str]
) -> list[LabScienceSequence]:
    sequences: list[LabScienceSequence] = []
    current: LabScienceSequence | None = None
    filling = ""
    for row in _rows(table):
        lower = row.text.lower()
        if row.kind == "header" and not row.indented:
            current = LabScienceSequence(
                department=row.text,
                footnotes=[footnotes[n] for n in row.footnotes if n in footnotes],
            )
            sequences.append(current)
            filling = ""
        elif (
            current is not None
            and row.kind in ("header", "comment")
            and "science a" in lower
        ):
            filling, current.science_a_label = "a", row.text
        elif (
            current is not None
            and row.kind in ("header", "comment")
            and "science b" in lower
        ):
            filling, current.science_b_label = "b", row.text
        elif current is not None and row.kind in ("course", "or") and row.links:
            options = (
                current.science_a_options
                if filling == "a"
                else current.science_b_options
            )
            if filling:
                options.append(_row_option(row))
    return sequences


# ---------------------------------------------------------------------------
# Plan grids
# ---------------------------------------------------------------------------


def parse_plan_grid(
    table: Tag, footnotes: dict[str, str], name: str = "", subtitle: str = ""
) -> SuggestedPlan:
    plan = SuggestedPlan(
        name=name, subtitle=subtitle, years=[], footnotes=list(footnotes.values())
    )
    year: PlanYear | None = None
    semester: PlanSemester | None = None
    selection: PlanCourse | None = None
    for tr in table.find_all("tr"):
        classes = tr.get("class") or []
        hours = _credit_text(tr.find("td", class_="hourscol"))
        if "plangridyear" in classes:
            match = re.search(r"\d+", tr.get_text())
            year = PlanYear(
                year=int(match.group()) if match else len(plan.years) + 1, semesters=[]
            )
            plan.years.append(year)
        elif "plangridterm" in classes:
            heading = tr.find("th")
            semester = PlanSemester(term=text(heading), courses=[])
            if year is None:
                year = PlanYear(year=1, semesters=[])
                plan.years.append(year)
            year.semesters.append(semester)
            selection = None
        elif "plangridsum" in classes:
            if semester is not None:
                semester.total_credits = hours
        elif "plangridtotal" in classes:
            plan.total_credits = hours
        elif semester is not None and (code_cell := tr.find("td", class_="codecol")):
            numbers, attributes = _sups(tr)
            notes = [footnotes[n] for n in numbers if n in footnotes]
            options = _plan_options(code_cell, tr.find("td", class_="titlecol"))
            if not options:
                words = text(code_cell, skip_sup=True)
                slot = PlanCourse(
                    placeholder=words,
                    credits=hours,
                    attributes=attributes,
                    footnotes=notes,
                )
                semester.courses.append(slot)
                selection = slot if _is_selection(words) else None
            elif selection is not None and _is_indented(code_cell):
                selection.options.extend(options)
                selection.footnotes.extend(notes)
            else:
                semester.courses.append(
                    PlanCourse(
                        course=options[0],
                        options=options,
                        credits=hours,
                        footnotes=notes,
                    )
                )
                selection = None
    return plan


def _sups(tr: Tag) -> tuple[list[str], list[str]]:
    """A row's superscripts: footnote numbers ("4, 5" is two) and attribute codes ("GQ")."""
    tokens = [
        t
        for sup in tr.find_all("sup")
        for t in re.split(r"[\s,]+", clean(sup.get_text()))
        if t
    ]
    return [t for t in tokens if t.isdigit()], [t for t in tokens if not t.isdigit()]


def _credit_text(cell: Tag | None) -> str:
    """A credits cell, with "1 to 4" written as the range "1-4"."""
    return re.sub(r"\s+to\s+", "-", text(cell, skip_sup=True))


def _plan_options(code_cell: Tag, title_cell: Tag | None) -> list[CourseOption]:
    """A plan cell's alternatives ("MATH 1041 or MATH 1941"), each possibly corequisites ("A & B")."""
    groups: list[list[Tag]] = []
    joined = False
    for node in code_cell.descendants:
        if isinstance(node, Tag) and "bubblelink" in (node.get("class") or []):
            if joined and groups:
                groups[-1].append(node)
            else:
                groups.append([node])
            joined = False
        elif (
            isinstance(node, NavigableString)
            and node.parent is not None
            and node.parent.name != "a"
        ):
            token = clean(str(node)).lower()
            if token == _AND:
                joined = True
            elif token == _OR:
                joined = False
    titles = [
        re.sub(r"^or\s+", "", line, flags=re.IGNORECASE)
        for line in _title_lines(title_cell)
    ] or [""]
    options: list[CourseOption] = []
    for i, links in enumerate(groups):
        title = titles[min(i, len(titles) - 1)]
        options.append(
            CourseOption(
                courses=[_course_ref(link, title, "") for link in links],
                is_honors_variant=_HONORS in title.lower(),
            )
        )
    return options
