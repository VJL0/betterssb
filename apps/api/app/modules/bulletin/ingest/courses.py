"""Course entries from a Bulletin subject page (/undergraduate/courses/cis/)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal

from bs4 import BeautifulSoup, Tag

from app.modules.bulletin.ingest.prerequisites import parse_prerequisites
from app.modules.bulletin.ingest.rules import (
    COURSE_CODE,
    SUBJECT,
    RuleNodeDraft,
    clean_text,
)

# "CIS 3296. Software Design. 4 Credit Hours." / "1 to 4 Credit Hours." / "0 or 4"
COURSE_TITLE = re.compile(
    rf"^(?P<subject>{SUBJECT}) (?P<number>[0-9]{{4}}|[A-Z][0-9]{{3}})\.\s+"
    r"(?P<title>.*?)\.?\s+"
    r"(?P<credits>(?P<low>[0-9]+(?:\.[0-9]+)?)"
    r"(?: (?P<joiner>to|or) (?P<high>[0-9]+(?:\.[0-9]+)?))?) Credit Hours?\.?$"
)
# "Computer & Information Science (CIS)"
SUBJECT_HEADING = re.compile(rf"^(?P<name>.+?)\s*\((?P<code>{SUBJECT})\)$")
RESTRICTION = re.compile(
    r"^(?P<mode>Must|May not) be enrolled in one of the following "
    r"(?P<kind>[^:]+):\s*(?P<values>.*?)\.?$",
    re.IGNORECASE,
)
PREREQUISITE_LABEL = "Pre-requisites"
COREQUISITE_LABEL = "Co-requisites"
REPEATABILITY_LABEL = "Repeatability"
ATTRIBUTES_LABEL = "Course Attributes"
DUPLICATE_CREDIT = re.compile(r"duplicate (?:course|credit)", re.IGNORECASE)
CROSS_LISTED = re.compile(r"cross[- ]listed", re.IGNORECASE)


@dataclass(slots=True)
class RestrictionDraft:
    kind: str
    mode: str
    values: list[str]
    source_text: str


@dataclass(slots=True)
class RelationshipDraft:
    subject: str
    number: str
    kind: str
    source_text: str


@dataclass(slots=True)
class CourseDraft:
    subject: str
    number: str
    title: str
    credits_text: str
    credits_min: Decimal | None
    credits_max: Decimal | None
    description: str
    parts: dict[str, str]
    attributes: list[str] = field(default_factory=list)
    restrictions: list[RestrictionDraft] = field(default_factory=list)
    relationships: list[RelationshipDraft] = field(default_factory=list)
    prerequisites: RuleNodeDraft | None = None
    corequisites: RuleNodeDraft | None = None

    @property
    def code(self) -> str:
        return f"{self.subject} {self.number}"


@dataclass(slots=True)
class SubjectPage:
    code: str
    name: str
    courses: list[CourseDraft]
    # Course blocks whose heading didn't match; kept for ingestion issues.
    unparsed_titles: list[str]


def parse_subject_page(html: str) -> SubjectPage:
    soup = BeautifulSoup(html, "lxml")
    heading = soup.select_one("h1.page-title")
    code, name = "", clean_text(heading.get_text()) if heading else ""
    if match := SUBJECT_HEADING.match(name):
        code, name = match["code"], match["name"]

    courses: list[CourseDraft] = []
    unparsed: list[str] = []
    for block in soup.select("div.courseblock"):
        title = block.select_one(".courseblocktitle")
        title_text = clean_text(title.get_text(" ")) if title else ""
        if course := _parse_course_block(block, title_text):
            courses.append(course)
        else:
            unparsed.append(title_text)
    return SubjectPage(code=code, name=name, courses=courses, unparsed_titles=unparsed)


def _parse_course_block(block: Tag, title_text: str) -> CourseDraft | None:
    description = block.select_one(".courseblockdesc > .courseblockheaddiv")
    return build_course(
        title_text,
        clean_text(description.get_text(" ")) if description else "",
        _labeled_parts(block),
    )


def build_course(
    title_text: str, description: str, parts: dict[str, str]
) -> CourseDraft | None:
    """A course from its heading, description and labeled parts, from HTML or PDF."""
    match = COURSE_TITLE.match(title_text)
    if not match:
        return None
    low = Decimal(match["low"])
    course = CourseDraft(
        subject=match["subject"],
        number=match["number"],
        title=clean_text(match["title"]),
        credits_text=match["credits"],
        credits_min=low,
        credits_max=Decimal(match["high"]) if match["high"] else low,
        description=description,
        parts=parts,
    )
    course.attributes = [
        code.strip()
        for code in parts.get(ATTRIBUTES_LABEL, "").split(",")
        if code.strip()
    ]
    course.restrictions = [
        restriction
        for label, text in parts.items()
        if label.endswith("Restrictions") and (restriction := _restriction(text))
    ]
    if PREREQUISITE_LABEL in parts:
        course.prerequisites = parse_prerequisites(parts[PREREQUISITE_LABEL])
    if COREQUISITE_LABEL in parts:
        course.corequisites = parse_prerequisites(parts[COREQUISITE_LABEL])
    course.relationships = _description_relationships(description, course)
    return course


def _labeled_parts(block: Tag) -> dict[str, str]:
    """Each bold label and the text up to the next one.

    One paragraph can hold several ("Field of Study Restrictions: ...<br>
    College Restrictions: ..."), so labels are split on, not paragraphs.
    """
    pieces: dict[str, list[str]] = {}
    for part in block.select(".courseblockpart"):
        label = None
        for child in part.children:
            if isinstance(child, Tag) and child.name == "strong":
                label = clean_text(child.get_text()).rstrip(":")
                pieces[label] = []
            elif label is not None:
                text = child.get_text(" ") if isinstance(child, Tag) else str(child)
                pieces[label].append(text)
    return {label: clean_text(" ".join(texts)) for label, texts in pieces.items()}


def _restriction(text: str) -> RestrictionDraft | None:
    match = RESTRICTION.match(text)
    if not match:
        return None
    return RestrictionDraft(
        kind=match["kind"].strip().lower().replace(" ", "_"),
        mode="include" if match["mode"].lower() == "must" else "exclude",
        values=[value.strip() for value in match["values"].split(",") if value.strip()],
        source_text=text,
    )


def _sentences(text: str) -> list[str]:
    return [sentence for sentence in re.split(r"(?<=[.;])\s+", text) if sentence]


def _description_relationships(
    description: str, course: CourseDraft
) -> list[RelationshipDraft]:
    """Courses the description names, with the sentence and what it states."""
    relationships: list[RelationshipDraft] = []
    seen: set[tuple[str, str]] = set()
    for sentence in _sentences(description):
        if DUPLICATE_CREDIT.search(sentence):
            kind = "duplicate_credit"
        elif CROSS_LISTED.search(sentence):
            kind = "cross_listed"
        else:
            kind = "mentioned"
        for subject, number in COURSE_CODE.findall(sentence):
            key = (subject, number)
            if key == (course.subject, course.number) or key in seen:
                continue
            seen.add(key)
            relationships.append(RelationshipDraft(subject, number, kind, sentence))
    return relationships
