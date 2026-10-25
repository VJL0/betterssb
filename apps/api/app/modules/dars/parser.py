"""Parse a u.achieve (DARS) audit page into structured data.

Reads both the printer-friendly report (`audit/read.html`) and the regular
Audit Results page, which share their requirement markup. The student ID in
the header is left out on purpose: nothing in the app needs it.
"""

from __future__ import annotations

import json
import re
from typing import Any

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from app.modules.dars.schemas import (
    Audit,
    AuditCourse,
    AuditStatus,
    ChoiceCourse,
    CourseChoice,
    HoursSummary,
    Progress,
    Requirement,
    SubRequirement,
)

_STATUS_CLASSES: dict[str, AuditStatus] = {
    "Status_OK": "complete",
    "Status_NO": "incomplete",
    "Status_IP": "in_progress",
}
_RULE_LINE = re.compile(r"^_+$")
# Letter-spaced banners like "W A R N I N G" stand alone.
_SPACED_HEADING = re.compile(r"^(\S ){2,}\S$")
# DARS wraps text at a fixed width; these start a new note rather than continue one.
_NOTE_START = re.compile(r"^(\*|-|\d+[.)]\s)")
_NOTE_MARKS = re.compile(r"^\*+\s*|\s*\*+$")
# DARS wraps at about 65 columns, so a line this short wasn't wrapped and ends its note.
_UNWRAPPED_LINE_LENGTH = 30
_COURSE_CODE = re.compile(r"^[A-Z&]{2,5} \d{4}")
# A transfer source line: the institution code, then its course ("T01008: AP314").
_TRANSFER_SOURCE = re.compile(r"^(T\d+):\s*(\S+)")
_TRANSFER_GRADE = "TR"
_SATISFIES = re.compile(r"^Satisfies:\s*(.+)$")
# DARS writes 0 for no rule and 999 for "as many as apply".
_NO_CREDIT_LIMIT = 999.0
# DARS terms are a season and a two-digit year: FL24, SP25, S124 (Summer I), S224 (Summer II).
_DARS_TERM = re.compile(r"^(FL|SP|S1|S2)(\d{2})$")
_BANNER_SEASON_CODES = {"SP": "03", "S1": "20", "S2": "26", "FL": "36"}
# An option's trailing note: a credit cap ("3381(4)") or when it counts ("(SP19 OR AFTER)").
_OPTION_NOTE = re.compile(r"\(([^)]*)\)\s*$")
_CROSS_LISTED = "OR"
_REQUIRED_MARKER = "R"
_HIDDEN_ALIAS = "HIDE"
_END_OF_ANALYSIS = re.compile(r"END OF ANALYSIS")
# The page's progress charts are drawn from JSON passed to these functions.
_CATEGORY_CHART = "loadAcademicProgressGraph"
_DEGREE_CHART = "loadGpaDetailGraph"


def parse_audit(html: str) -> Audit:
    soup = BeautifulSoup(html, "lxml")
    title = soup.select_one(".auditTitle")
    if title:
        # The regular page puts a "Request Audit" button in the title block.
        for button in title.select(".floatright"):
            button.decompose()
    title_lines = [line for line in _br_lines(title) if line]
    header = _header_fields(soup)

    if soup.select_one(".completionTextOK"):
        complete: bool | None = True
    elif soup.select_one(".completionTextNO"):
        complete = False
    else:
        complete = None

    degree_series = _chart_series(soup, _DEGREE_CHART)
    return Audit(
        student_name=title_lines[0] if title_lines else "",
        program_title=title_lines[1] if len(title_lines) > 1 else "",
        program_code=header.get("Program Code", ""),
        catalog_year=header.get("Catalog Year", ""),
        prepared_on=header.get("Prepared On", ""),
        graduation_date=header.get("Graduation Date", ""),
        complete=complete,
        analysis_complete=soup.find(string=_END_OF_ANALYSIS) is not None,
        degree_totals=_hours_summary(degree_series[0]) if degree_series else None,
        category_totals=[
            _hours_summary(series) for series in _chart_series(soup, _CATEGORY_CHART)
        ],
        requirements=[
            _requirement(el) for el in soup.select("#auditRequirements .requirement")
        ],
    )


def _header_fields(soup: BeautifulSoup) -> dict[str, str]:
    labels = soup.select(".auditHeader .auditHeaderEntryLabel")
    values = soup.select(".auditHeader .auditHeaderEntry")
    return {
        _text(label): _text(value)
        for label, value in zip(labels, values, strict=False)
        if _text(label)
    }


def _chart_series(soup: BeautifulSoup, function: str) -> list[dict[str, Any]]:
    """The data series passed to one of the page's chart functions; the printer-friendly page has none."""
    for script in soup.find_all("script"):
        text = script.string or ""
        call = text.find(f"{function}(")
        start = text.find('{"options"', call) if call != -1 else -1
        if start == -1:
            continue
        try:
            chart, _ = json.JSONDecoder().raw_decode(text, start)
        except ValueError:
            return []
        series = chart.get("data") if isinstance(chart, dict) else None
        return (
            [s for s in series if isinstance(s, dict)]
            if isinstance(series, list)
            else []
        )
    return []


def _hours_summary(series: dict[str, Any]) -> HoursSummary:
    return HoursSummary(
        category=str(series.get("label") or ""),
        completed_credits=_chart_number(series.get("completedHours")) or 0.0,
        in_progress_credits=_chart_number(series.get("inProgressHours")) or 0.0,
        unfulfilled_credits=_chart_number(series.get("unfulfilledHours")) or 0.0,
        planned_credits=_chart_number(series.get("plannedHours")) or 0.0,
        # The chart reports 0 for a GPA it doesn't track.
        gpa=_chart_number(series.get("gpa")) or None,
        required_gpa=_chart_number(series.get("reqGpa")) or None,
    )


def _chart_number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _requirement(el: Tag) -> Requirement:
    code = (el.get("rname") or "").strip()
    category = next(
        (
            c.removeprefix("category_")
            for c in el.get("class", [])
            if c.startswith("category_")
        ),
        "",
    )
    # A title can wrap over several lines and be followed by notes.
    title, *title_notes = _paragraphs(_br_lines(el.select_one(".reqTitle"))) or [""]
    totals = el.select_one(".requirementTotals")
    status = _status(el)
    # Informational sections (course history, warnings) carry rule attributes that constrain nothing.
    rules = el if status != "none" else None
    return Requirement(
        code=code,
        category="" if category == "BLANK" else category,
        title=_clean_title(title, code),
        status=status,
        notes=_paragraphs(_br_lines(el.select_one(".reqHeader"))) + title_notes,
        required_credits=_rule(rules, "rqdhours"),
        required_gpa=_rule(rules, "rqdgpa"),
        required_subrequirements=_rule_count(rules, "rqdsubreq"),
        required_count=_rule_count(rules, "rqdcount"),
        max_credits=_rule(rules, "maxhours"),
        earned=_progress(totals.select_one("tr.reqEarned")) if totals else None,
        in_progress=_progress(totals.select_one("tr.reqIpDetail")) if totals else None,
        needs=_progress(totals.select_one("tr.reqNeeds")) if totals else None,
        subrequirements=[
            _subrequirement(sub, status, has_rules=rules is not None)
            for sub in el.select(".subrequirement")
        ],
    )


def _subrequirement(
    el: Tag, parent_status: AuditStatus, *, has_rules: bool
) -> SubRequirement:
    status_el = el.select_one(".subreqPretext .status")
    has_own_status = status_el is not None and any(
        c.startswith("Status_") for c in status_el.get("class", [])
    )
    title, notes = _split_subrequirement_title(_br_lines(el.select_one(".subreqTitle")))
    totals = el.select_one(".subrequirementTotals")
    code = (el.get("pseudo") or "").strip()
    rules = el if has_rules else None
    choices = _choices(el.select_one(".selectcourses"))
    return SubRequirement(
        number=_text(el.select_one(".subreqNumber")).rstrip(")"),
        code=code,
        aliases=_aliases(el.get("pseudolist") or "", code),
        title=title,
        notes=notes,
        # Single, untitled sub-requirements carry no status of their own; they mirror the requirement.
        status=_status(status_el) if has_own_status else parent_status,
        required=_text(el.select_one(".subreqRequired")) == _REQUIRED_MARKER,
        required_credits=_rule(rules, "rqdhours"),
        required_count=_rule_count(rules, "rqdsubreq"),
        required_gpa=_rule(rules, "rqdgpa"),
        max_credits=_rule(rules, "maxhours"),
        earned=_progress(totals.select_one("tr.subreqEarned")) if totals else None,
        in_progress=_progress(totals.select_one("tr.subreqIpHours"))
        if totals
        else None,
        needs=_progress(el.select_one(".subreqNeeds")),
        courses=[_course(row) for row in el.select("tr.takenCourse")],
        select_from=list(
            dict.fromkeys(c.course for choice in choices for c in choice.courses)
        ),
        choices=choices,
        not_from=[
            c.course
            for choice in _choices(el.select_one(".notcourses"))
            for c in choice.courses
        ],
    )


def _rule(el: Tag | None, attribute: str) -> float | None:
    """A rule from an element attribute, or None where DARS writes 0 (no rule) or 999 (no limit)."""
    if el is None:
        return None
    value = _number_text(el.get(attribute) or "")
    return value if value and value < _NO_CREDIT_LIMIT else None


def _rule_count(el: Tag | None, attribute: str) -> int | None:
    value = _rule(el, attribute)
    return int(value) if value is not None else None


def _aliases(pseudolist: str, code: str) -> list[str]:
    try:
        names = json.loads(pseudolist)
    except ValueError:
        return []
    if not isinstance(names, list):
        return []
    aliases = [n.strip() for n in names if isinstance(n, str)]
    return list(
        dict.fromkeys(a for a in aliases if a and a not in (code, _HIDDEN_ALIAS))
    )


def _split_subrequirement_title(lines: list[str]) -> tuple[str, list[str]]:
    """The title runs to the line ending " -", or up to the first "*" note when none does."""
    end = next((i for i, line in enumerate(lines) if line.endswith("-")), None)
    if end is None:
        end = next(
            (i - 1 for i, line in enumerate(lines) if _NOTE_START.match(line)),
            len(lines) - 1,
        )
    title = " ".join(lines[: end + 1]).rstrip(" -")
    return title, _paragraphs(lines[end + 1 :])


def _course(row: Tag) -> AuditCourse:
    course = _text(row.select_one(".course"))
    grade = _text(row.select_one(".grade"))
    title, *notes = [_text(line) for line in row.select(".descLine")] or [""]
    term = _text(row.select_one(".term"))
    transfer_source = next(
        (m for m in (_TRANSFER_SOURCE.match(n) for n in notes) if m), None
    )
    satisfies = next((m for m in (_SATISFIES.match(n) for n in notes) if m), None)
    return AuditCourse(
        term=term,
        banner_term=_banner_term(term),
        course=course,
        title=title,
        credits=_number(row.select_one(".credit")),
        grade=grade,
        in_progress="ip" in row.get("class", []),
        condition_code=_text(row.select_one(".ccode")),
        notes=notes,
        transfer=grade == _TRANSFER_GRADE or transfer_source is not None,
        transfer_institution=transfer_source.group(1) if transfer_source else "",
        transfer_course=transfer_source.group(2) if transfer_source else "",
        satisfies=satisfies.group(1).strip() if satisfies else "",
        exception=bool(course) and not _COURSE_CODE.match(course),
    )


def _banner_term(term: str) -> str:
    match = _DARS_TERM.match(term)
    if not match:
        return ""
    season, year = match.groups()
    return f"20{year}{_BANNER_SEASON_CODES[season]}"


def _choices(table: Tag | None) -> list[CourseChoice]:
    """Courses listed under SELECT FROM (or NOT FROM), grouped where DARS joins them with OR."""
    choices: list[CourseChoice] = []
    if table is None:
        return choices
    cross_listed = False
    for node in table.descendants:
        if (
            isinstance(node, Tag)
            and node.name == "span"
            and "course" in node.get("class", [])
        ):
            course = _choice_course(node)
            # A range lists its first and last course; both give the same label.
            if choices and any(c.course == course.course for c in choices[-1].courses):
                continue
            if cross_listed and choices:
                choices[-1].courses.append(course)
            else:
                choices.append(CourseChoice(courses=[course]))
            cross_listed = False
        elif (
            isinstance(node, NavigableString)
            and not isinstance(node, Comment)
            and node.parent is not None
            and node.parent.name == "td"
            and node.strip()
        ):
            cross_listed = node.strip() == _CROSS_LISTED
    return choices


def _choice_course(span: Tag) -> ChoiceCourse:
    dept = " ".join((span.get("department") or "").split())
    number = (span.get("number") or "").strip()
    if "range" in span.get("class", []):
        partner = (span.get("rangepartner") or "").split()[-1:]
        low, high = sorted([number, *partner])
        label = f"{dept} {low}-{high}"
    else:
        label = f"{dept} {number}"
    note = _OPTION_NOTE.search(_text(span))
    cap = _number_text(note.group(1)) if note else None
    return ChoiceCourse(
        course=label,
        taken=note.group(1).strip() if note and cap is None else "",
        max_credits=cap,
    )


def _status(el: Tag | None) -> AuditStatus:
    for cls in el.get("class", []) if el else []:
        if cls in _STATUS_CLASSES:
            return _STATUS_CLASSES[cls]
    return "none"


def _progress(row: Tag | None) -> Progress | None:
    if row is None:
        return None
    count = _number(row.select_one(".count"))
    # The count is courses unless DARS labels it sets ("SETS", "SET TAKEN").
    is_sets = "SET" in _text(row.select_one(".countlabel")).upper()
    subrequirements = _number(row.select_one(".subreqs"))
    progress = Progress(
        credits=_number(row.select_one(".hours")),
        courses=int(count) if count is not None and not is_sets else None,
        sets=int(count) if count is not None and is_sets else None,
        subrequirements=int(subrequirements) if subrequirements is not None else None,
        gpa=_number(row.select_one(".gpa")),
    )
    return progress if progress.model_dump(exclude_none=True) else None


def _clean_title(title: str, code: str) -> str:
    """Drop DARS's "~CODE --" prefix from a requirement title."""
    if code:
        title = re.sub(rf"^~?\s*{re.escape(code)}\s*[~\-]*\s*", "", title)
    return title.lstrip("~ ").strip()


def _number(el: Tag | None) -> float | None:
    return _number_text(_text(el))


def _number_text(text: str) -> float | None:
    """A number, ignoring the parentheses DARS puts around course history credits."""
    try:
        return float(text.strip("() "))
    except ValueError:
        return None


def _text(el: Tag | None) -> str:
    return " ".join(el.get_text(" ").split()) if el else ""


def _br_lines(el: Tag | None) -> list[str]:
    """Text split at <br>, whitespace-normalised; "" marks a blank line (two <br> in a row)."""
    if el is None:
        return []
    lines: list[str] = []
    current: list[str] = []
    for node in el.descendants:
        if isinstance(node, Tag) and node.name == "br":
            lines.append(" ".join("".join(current).split()))
            current = []
        elif isinstance(node, NavigableString) and not isinstance(node, Comment):
            current.append(str(node))
    lines.append(" ".join("".join(current).split()))
    while lines and not lines[-1]:
        lines.pop()
    while lines and not lines[0]:
        lines.pop(0)
    return lines


def _paragraphs(lines: list[str]) -> list[str]:
    """Rejoins DARS's fixed-width lines into notes, without "*" marks or ____ rules."""
    paragraphs: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            paragraphs.append(_NOTE_MARKS.sub("", " ".join(current)))
            current.clear()

    for line in lines:
        if not line or _RULE_LINE.match(line):
            flush()
        elif _SPACED_HEADING.match(line):
            flush()
            paragraphs.append(line)
        else:
            if _NOTE_START.match(line):
                flush()
            current.append(line)
            if len(line) < _UNWRAPPED_LINE_LENGTH:
                flush()
    flush()
    return [p for p in paragraphs if p]
