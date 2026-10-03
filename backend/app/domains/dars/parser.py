"""Parse a u.achieve (DARS) audit report page (`audit/read.html`) into structured data."""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from app.domains.dars.schemas import Audit, AuditCourse, AuditStatus, Progress, Requirement, SubRequirement

_STATUS_CLASSES: dict[str, AuditStatus] = {
    "Status_OK": "complete",
    "Status_NO": "incomplete",
    "Status_IP": "in_progress",
}
_RULE_LINE = re.compile(r"^_+$")


def parse_audit(html: str) -> Audit:
    soup = BeautifulSoup(html, "lxml")
    title_lines = _lines(soup.select_one(".auditTitle"))
    header = _header_fields(soup)

    if soup.select_one(".completionTextOK"):
        complete: bool | None = True
    elif soup.select_one(".completionTextNO"):
        complete = False
    else:
        complete = None

    return Audit(
        student_name=title_lines[0] if title_lines else "",
        program_title=title_lines[1] if len(title_lines) > 1 else "",
        program_code=header.get("Program Code", ""),
        catalog_year=header.get("Catalog Year", ""),
        prepared_on=header.get("Prepared On", ""),
        complete=complete,
        requirements=[_requirement(el) for el in soup.select("#auditRequirements .requirement")],
    )


def _header_fields(soup: BeautifulSoup) -> dict[str, str]:
    labels = soup.select(".auditHeader .auditHeaderEntryLabel")
    values = soup.select(".auditHeader .auditHeaderEntry")
    return {_text(label): _text(value) for label, value in zip(labels, values, strict=False) if _text(label)}


def _requirement(el: Tag) -> Requirement:
    code = (el.get("rname") or "").strip()
    category = next((c.removeprefix("category_") for c in el.get("class", []) if c.startswith("category_")), "")
    totals = el.select_one(".requirementTotals")
    return Requirement(
        code=code,
        category="" if category == "BLANK" else category,
        title=_clean_title(_text(el.select_one(".reqTitle")), code),
        status=_status(el),
        notes=_lines(el.select_one(".reqHeader")),
        earned=_progress(totals.select_one("tr.reqEarned")) if totals else None,
        in_progress=_progress(totals.select_one("tr.reqIpDetail")) if totals else None,
        needs=_progress(totals.select_one("tr.reqNeeds")) if totals else None,
        subrequirements=[_subrequirement(sub, _status(el)) for sub in el.select(".subrequirement")],
    )


def _subrequirement(el: Tag, parent_status: AuditStatus) -> SubRequirement:
    status_el = el.select_one(".subreqPretext .status")
    has_own_status = status_el is not None and any(c.startswith("Status_") for c in status_el.get("class", []))
    totals = el.select_one(".subrequirementTotals")
    return SubRequirement(
        number=_text(el.select_one(".subreqNumber")).rstrip(")"),
        title=_text(el.select_one(".subreqTitle")).rstrip(" -"),
        # Single, untitled sub-requirements carry no status of their own; they mirror the requirement.
        status=_status(status_el) if has_own_status else parent_status,
        earned=_progress(totals.select_one("tr.subreqEarned")) if totals else None,
        in_progress=_progress(totals.select_one("tr.subreqIpHours")) if totals else None,
        needs=_progress(el.select_one(".subreqNeeds")),
        courses=[_course(row) for row in el.select("tr.takenCourse")],
        select_from=_select_from(el),
    )


def _course(row: Tag) -> AuditCourse:
    return AuditCourse(
        term=_text(row.select_one(".term")),
        course=_text(row.select_one(".course")),
        title=_text(row.select_one(".descLine")),
        credits=_number(row.select_one(".credit")),
        grade=_text(row.select_one(".grade")),
        in_progress="ip" in row.get("class", []),
    )


def _select_from(el: Tag) -> list[str]:
    """Course options under "SELECT FROM", e.g. ["CIS 4397", "CST 2000-4999"], in display order."""
    options: list[str] = []
    for span in el.select(".selectcourses span.course"):
        dept = " ".join((span.get("department") or "").split())
        number = (span.get("number") or "").strip()
        if "range" in span.get("class", []):
            partner = (span.get("rangepartner") or "").split()[-1:]
            low, high = sorted([number, *partner])
            label = f"{dept} {low}-{high}"
        else:
            label = f"{dept} {number}"
        if label not in options:
            options.append(label)
    return options


def _status(el: Tag | None) -> AuditStatus:
    for cls in el.get("class", []) if el else []:
        if cls in _STATUS_CLASSES:
            return _STATUS_CLASSES[cls]
    return "none"


def _progress(row: Tag | None) -> Progress | None:
    if row is None:
        return None
    count = _number(row.select_one(".count"))
    progress = Progress(
        credits=_number(row.select_one(".hours")),
        courses=int(count) if count is not None else None,
        gpa=_number(row.select_one(".gpa")),
    )
    return progress if progress.model_dump(exclude_none=True) else None


def _clean_title(title: str, code: str) -> str:
    """Drop DARS's "~CODE --" prefix from a requirement title."""
    if code:
        title = re.sub(rf"^~?\s*{re.escape(code)}\s*[~\-]*\s*", "", title)
    return title.lstrip("~ ").strip()


def _number(el: Tag | None) -> float | None:
    try:
        return float(_text(el))
    except ValueError:
        return None


def _text(el: Tag | None) -> str:
    return " ".join(el.get_text(" ").split()) if el else ""


def _lines(el: Tag | None) -> list[str]:
    """Text split on <br>/block boundaries, whitespace-normalised, without blank or ____ rule lines."""
    if el is None:
        return []
    lines = (" ".join(line.split()) for line in el.get_text("\n").splitlines())
    return [line for line in lines if line and not _RULE_LINE.match(line)]
