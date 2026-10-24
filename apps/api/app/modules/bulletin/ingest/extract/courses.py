"""Course entries from CourseLeaf course listings (`div.courseblock`).

A block is a title line (`CIS 1068.  Program Design and Abstraction.  4
Credit Hours.`), a description, and labeled parts (`Pre-requisites:`,
`Course Attributes:`, eleven restriction and repeatability labels). Titles can
contain ". " themselves ("U.S. History"), so the credits are matched from the
end of the line, and the code from its start.

Parts are kept verbatim; interpreting prerequisites and restrictions is the
requirement parser's job, so a change there never needs a re-extraction.
"""

from __future__ import annotations

import re
from decimal import Decimal

from lxml import html
from pydantic import Field

from app.modules.bulletin.ingest.extract.document import clean_text
from app.modules.bulletin.ingest.records import Evidence, Locator, Record

TITLE_LINE = re.compile(
    r"^(?P<subject>[A-Z]{2,5})\s+(?P<number>[0-9A-Z]{4,5})\.\s+(?P<title>.+?)\.?\s+"
    r"(?P<credits>(?:\d+(?:\.\d+)?|\.\d+)(?:\s+(?:to|or)\s+(?:\d+(?:\.\d+)?|\.\d+))?)"
    r"\s+Credit\s+Hours?\.?$"
)
CREDIT_VALUE = re.compile(r"\d*\.?\d+")
COURSE_CODE = re.compile(r"\b([A-Z]{2,5})\s+([0-9][0-9A-Z]{3,4}|[A-Z][0-9]{3})\b")
ATTRIBUTE_SEPARATOR = re.compile(r"\s*,\s*")

PREREQUISITE_LABEL = "Pre-requisites"
COREQUISITE_LABEL = "Co-requisites"
REPEATABILITY_LABEL = "Repeatability"
ATTRIBUTES_LABEL = "Course Attributes"
RESTRICTION_SUFFIX = "Restrictions"


class CreditHours(Record):
    text: str
    minimum: Decimal
    maximum: Decimal
    # "0 or 3" allows exactly these values; a range ("1 to 4") leaves it empty.
    options: list[Decimal] = Field(default_factory=list)


class CoursePart(Record):
    label: str
    text: str
    evidence: Evidence


class CourseRecord(Record):
    subject: str
    number: str
    title: str
    credits: CreditHours
    description: str
    parts: list[CoursePart]
    attributes: list[str]
    # Course codes the entry links to or names, in order of appearance.
    referenced_courses: list[str]
    evidence: Evidence

    @property
    def code(self) -> str:
        return f"{self.subject} {self.number}"

    def part(self, label: str) -> CoursePart | None:
        return next((part for part in self.parts if part.label == label), None)


class UnparsedCourseBlock(Record):
    reason: str
    evidence: Evidence


def parse_credits(text: str) -> CreditHours:
    values = [Decimal(value) for value in CREDIT_VALUE.findall(text)]
    return CreditHours(
        text=text,
        minimum=min(values),
        maximum=max(values),
        options=values if " or " in text else [],
    )


def _referenced_courses(element: html.HtmlElement, text: str) -> list[str]:
    codes: list[str] = []
    for title in element.xpath('.//a[contains(@class,"bubblelink")]/@title'):
        codes.append(clean_text(title))
    codes.extend(f"{subject} {number}" for subject, number in COURSE_CODE.findall(text))
    return list(dict.fromkeys(codes))


def _description(block: html.HtmlElement) -> str:
    descriptions = block.xpath('.//*[contains(@class,"courseblockdesc")]')
    container = descriptions[0] if descriptions else block
    pieces = []
    for node in container.xpath(
        './/*[contains(@class,"courseblockheaddiv")] | ./text()'
    ):
        pieces.append(node if isinstance(node, str) else node.text_content())
    if not pieces:
        pieces = [
            child.text_content()
            for child in container
            if "courseblockpart" not in (child.get("class") or "")
            and "courseblocktitle" not in (child.get("class") or "")
        ]
    return clean_text(" ".join(pieces))


def parse_course_block(
    block: html.HtmlElement, url: str, sha256: str
) -> CourseRecord | UnparsedCourseBlock:
    tree = block.getroottree()

    def evidence(element: html.HtmlElement) -> Evidence:
        return Evidence(
            url=url,
            sha256=sha256,
            locator=Locator(xpath=tree.getpath(element), line=element.sourceline),
            text=clean_text(element.text_content()),
        )

    titles = block.xpath('.//*[contains(@class,"courseblocktitle")]')
    title_line = clean_text(titles[0].text_content()) if titles else ""
    match = TITLE_LINE.match(title_line)
    if match is None:
        return UnparsedCourseBlock(
            reason=f"title line not understood: {title_line!r}",
            evidence=evidence(block),
        )
    parts = []
    for part in block.xpath('.//*[contains(@class,"courseblockpart")]'):
        labels = part.xpath("./strong")
        label = clean_text(labels[0].text_content()).rstrip(":") if labels else ""
        text = clean_text(part.text_content())
        if label and text.startswith(label):
            text = text[len(label) :].lstrip(": ").strip()
        parts.append(CoursePart(label=label, text=text, evidence=evidence(part)))
    attributes_part = next((p for p in parts if p.label == ATTRIBUTES_LABEL), None)
    description = _description(block)
    return CourseRecord(
        subject=match["subject"],
        number=match["number"],
        title=match["title"].strip().rstrip("."),
        credits=parse_credits(match["credits"]),
        description=description,
        parts=parts,
        attributes=(
            [a for a in ATTRIBUTE_SEPARATOR.split(attributes_part.text) if a]
            if attributes_part
            else []
        ),
        referenced_courses=[
            code
            for code in _referenced_courses(block, description)
            if code != f"{match['subject']} {match['number']}"
        ],
        evidence=evidence(block),
    )


def course_blocks(document: html.HtmlElement) -> list[html.HtmlElement]:
    return document.xpath('//div[contains(concat(" ", @class, " "), " courseblock ")]')


def parse_course_listing(
    document: html.HtmlElement, url: str, sha256: str
) -> tuple[list[CourseRecord], list[UnparsedCourseBlock]]:
    courses: list[CourseRecord] = []
    unparsed: list[UnparsedCourseBlock] = []
    for block in course_blocks(document):
        result = parse_course_block(block, url, sha256)
        (courses if isinstance(result, CourseRecord) else unparsed).append(result)
    return courses, unparsed
