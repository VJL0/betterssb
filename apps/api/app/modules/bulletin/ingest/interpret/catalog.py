"""Catalog-wide facts from extracted pages: policy sections, academic units,
program metadata and the course lists that General Education pages publish.

Everything here is deterministic and conservative. Topics, credential types
and levels come from fixed keyword rules and Temple's own Academic Programs
Chart; when a rule can't decide, the record says so (`topic="other"`, an
`unresolved` note) instead of guessing. Every record keeps the evidence it was
read from, so a reader can always check it against the snapshot.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from typing import Literal

from pydantic import Field

from app.modules.bulletin.ingest.extract.classify import PageKind, edition_path
from app.modules.bulletin.ingest.extract.courses import COURSE_CODE
from app.modules.bulletin.ingest.extract.document import clean_text
from app.modules.bulletin.ingest.extract.program_index import (
    ProgramIndex,
    ProgramListing,
)
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.run import ExtractedPage
from app.modules.bulletin.ingest.records import (
    Block,
    BlockKind,
    Evidence,
    Link,
    Locator,
    PageDocument,
    Record,
)

# ---------------------------------------------------------------------------
# Policy sections
# ---------------------------------------------------------------------------

SECTION_PAGE_KINDS = frozenset(
    {
        PageKind.POLICY,
        PageKind.GENERAL_EDUCATION,
        PageKind.INFORMATION,
        PageKind.ACADEMIC_UNIT,
        PageKind.PROGRAM_LIST,
    }
)
# Faculty rosters are directories, not academic rules.
SKIPPED_TAB_MARKER = "faculty"
CLAUSE_TITLE_MAX_LENGTH = 100
# A numbered policy row: "02.25.11 | Continuous Enrollment/Registration".
CLAUSE_LINE = re.compile(r"^(?P<number>\d{2}(?:\.\d{2})+)\s*\|\s*(?P<body>.*)$")

Topic = Literal[
    "writing_intensive",
    "gened",
    "honors",
    "repeat",
    "transfer_credit",
    "readmission",
    "continuous_enrollment",
    "time_limit",
    "thesis_dissertation",
    "examination",
    "residency",
    "academic_standing",
    "grading",
    "graduation",
    "leave",
    "registration",
    "admission",
    "conduct",
    "requisites",
    "credit_hours",
    "records",
    "other",
]

# Checked in order against the section's headings (deepest first), then the
# page heading, then the page's path; the first rule that matches any one of
# them wins. Specific topics come before the broad ones they'd otherwise fall
# into ("Repeating a Course" is about repeats, not grading). Generic headings
# such as "Policy Statement" or "Notes" match nothing and fall through to the
# page heading.
TOPIC_RULES: tuple[tuple[Topic, re.Pattern[str]], ...] = tuple(
    (topic, re.compile(pattern, re.IGNORECASE))
    for topic, pattern in (
        ("writing_intensive", r"writing[- ]intensive"),
        ("gened", r"general education|\bgened\b"),
        ("honors", r"\bhonors?\b|dean'?s list"),
        ("repeat", r"\brepeat"),
        (
            "transfer_credit",
            (
                r"transfer credit|transfer of credit|advanced standing|prior learning"
                r"|reverse transfer|course at another institution"
            ),
        ),
        ("readmission", r"re-?admission|reinstatement|re-?enroll"),
        (
            "continuous_enrollment",
            r"continuous (registration|enrollment)|maint\w* (of )?matriculation",
        ),
        ("time_limit", r"time limit|over ten years|statute of limitation"),
        ("thesis_dissertation", r"\bthesis\b|\btheses\b|dissertation"),
        (
            "examination",
            r"examination|\bexams?\b|qualifying|preliminary|comprehensive exam",
        ),
        ("residency", r"\bresidency\b"),
        (
            "academic_standing",
            (
                r"academic standing|good standing|standards of scholarship|probation"
                r"|dismissal|academic progress"
            ),
        ),
        (
            "grading",
            (
                r"\bgrades?\b|grading|\bgpa\b|grade point|incomplete|credit/no credit"
                r"|pass/fail|\baudit\b|forgiveness"
            ),
        ),
        (
            "graduation",
            (
                r"graduation|commencement|second degree|double major|inapplicable"
                r"|exit requirements"
            ),
        ),
        ("leave", r"leave of absence|military service"),
        (
            "registration",
            (
                r"registration|withdraw|dropping|course load|simultaneous enrollment"
                r"|full-time|part-time"
            ),
        ),
        ("admission", r"\badmissions?\b"),
        (
            "conduct",
            r"conduct|plagiarism|cheating|grievance|appeals?\b|rights and responsib",
        ),
        ("requisites", r"\bpre-?requisites?\b|\bco-?requisites?\b"),
        ("credit_hours", r"credit hours?|course numbering"),
        ("records", r"\bferpa\b|transcripts?\b|privacy"),
    )
)


class SectionBlock(Record):
    kind: BlockKind
    text: str
    evidence: Evidence


class PolicyClause(Record):
    """A numbered clause of a policy printed as a table ("02.25.11 |
    Continuous Enrollment/Registration", then its text), as the Graduate
    School's policies are. The clause shares its table's evidence; its number
    pins it down within the table."""

    number: str
    # The clause number one level up ("02.25" for "02.25.11"), if any.
    parent: str | None
    # The numbered line, when lines of text follow it; otherwise empty.
    title: str
    text: str
    topic: Topic


class PolicySection(Record):
    """A run of blocks under one heading path within one tab of a page."""

    edition: str
    url: str
    sha256: str
    page_kind: PageKind
    page_heading: str
    # "undergraduate", "graduate", or "all" for pages outside both sections.
    level: str
    # Position of the section on its page, from 0.
    index: int
    tab: str | None
    tab_label: str | None
    # Headings above the blocks, outermost first; empty before the first one.
    heading_path: list[str]
    topic: Topic
    blocks: list[SectionBlock]
    links: list[Link]
    clauses: list[PolicyClause] = Field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(block.text for block in self.blocks)


def classify_topic(
    heading_path: Sequence[str],
    page_heading: str,
    url: str,
    titles: Sequence[str] = (),
) -> Topic:
    """The first topic whose rule matches the headings (deepest first), then
    any `titles` (a clause or tab title), then the page heading and path."""
    slug = edition_path(url).strip("/").replace("-", " ").replace("/", " ")
    candidates = [*reversed(heading_path), *titles, page_heading, slug]
    return next(
        (topic for c in candidates if (topic := match_topic(c)) != "other"), "other"
    )


def match_topic(text: str) -> Topic:
    return next(
        (topic for topic, pattern in TOPIC_RULES if pattern.search(text)), "other"
    )


def page_level(url: str) -> str:
    path = edition_path(url)
    if path.startswith("/undergraduate/"):
        return "undergraduate"
    if path.startswith("/graduate/"):
        return "graduate"
    return "all"


def _is_skipped_tab(tab: str | None) -> bool:
    return tab is not None and SKIPPED_TAB_MARKER in tab


def _ancestors(number: str) -> list[str]:
    """Enclosing clause numbers, nearest first: "02.25.14.02.02" →
    ["02.25.14.02", "02.25.14", "02.25"]. Temple skips some levels."""
    parts = number.split(".")
    return [".".join(parts[:end]) for end in range(len(parts) - 1, 1, -1)]


def _is_title(text: str) -> bool:
    return len(text) <= CLAUSE_TITLE_MAX_LENGTH and not text.endswith((".", ":", ";"))


def policy_clauses(text: str, section_topic: Topic) -> list[PolicyClause]:
    """Numbered clauses from a table block's text (rows joined by newlines,
    cells by " | "). Rows that start with " | " continue the clause above.

    A numbered line is a title when it's short and unpunctuated and text or
    sub-clauses follow it ("02.25.15 | Time Limits for a Degree"). A clause's
    topic comes from its own title, else its parent clause's topic, else the
    section's; body text is never keyword-matched, since it mentions every
    topic in passing.
    """
    clauses: list[PolicyClause] = []
    for line in text.split("\n"):
        if match := CLAUSE_LINE.match(line):
            number, body = match["number"], match["body"].strip()
            parent = number.rsplit(".", 1)[0] if number.count(".") > 1 else None
            clauses.append(
                PolicyClause(
                    number=number,
                    parent=parent,
                    title="",
                    text=body,
                    topic=section_topic,
                )
            )
        elif clauses and (body := line.strip().removeprefix("|").strip()):
            clause = clauses[-1]
            if not clause.title and clause.text and _is_title(clause.text):
                clause.title, clause.text = clause.text, ""
            clause.text = f"{clause.text}\n{body}".strip()
    parents = {clause.parent for clause in clauses}
    topics: dict[str, Topic] = {}
    for clause in clauses:
        if not clause.title and clause.number in parents and _is_title(clause.text):
            clause.title, clause.text = clause.text, ""
        inherited = next(
            (topics[n] for n in _ancestors(clause.number) if n in topics),
            section_topic,
        )
        own = match_topic(clause.title) if clause.title else "other"
        clause.topic = own if own != "other" else inherited
        topics[clause.number] = clause.topic
    return clauses


def _leading_title(blocks: Sequence[Block]) -> list[str]:
    """A numbered table's first clause title ("02.25 | CURRENCY AND TIME
    LIMITS"), which names the whole section."""
    if blocks and blocks[0].kind == "table":
        first_line = blocks[0].text.split("\n", 1)[0]
        if match := CLAUSE_LINE.match(first_line):
            return [match["body"]]
    return []


def policy_sections(page: ExtractedPage, edition: str) -> list[PolicySection]:
    """Split a policy-like page into sections at its headings.

    Heading blocks open sections and aren't repeated inside them; sections
    with no text of their own (a heading directly followed by a subheading)
    are dropped, since the subheading's section carries the full path.
    """
    if page.kind not in SECTION_PAGE_KINDS:
        return []
    document = page.document
    tab_labels = {tab.id: tab.label for tab in document.tabs}
    groups: list[tuple[str | None, list[str], list[Block]]] = []
    for block in document.blocks:
        tab = block.locator.tab
        if _is_skipped_tab(tab):
            continue
        path = (
            [*block.section, block.text] if block.kind == "heading" else block.section
        )
        if not groups or groups[-1][0] != tab or groups[-1][1] != path:
            groups.append((tab, path, []))
        if block.kind != "heading":
            groups[-1][2].append(block)
    sections: list[PolicySection] = []
    for tab, path, blocks in groups:
        if not blocks:
            continue
        indexes = {block.index for block in blocks}
        tab_label = tab_labels.get(tab) if tab else None
        titles = [*_leading_title(blocks), *([tab_label] if tab_label else [])]
        topic = classify_topic(path, document.heading, document.url, titles)
        sections.append(
            PolicySection(
                edition=edition,
                url=document.url,
                sha256=document.sha256,
                page_kind=page.kind,
                page_heading=document.heading,
                level=page_level(document.url),
                index=len(sections),
                tab=tab,
                tab_label=tab_label,
                heading_path=path,
                topic=topic,
                blocks=[
                    SectionBlock(
                        kind=block.kind,
                        text=block.text,
                        evidence=document.evidence(block),
                    )
                    for block in blocks
                ],
                links=[link for link in document.links if link.block_index in indexes],
                clauses=[
                    clause
                    for block in blocks
                    if block.kind == "table"
                    for clause in policy_clauses(block.text, topic)
                ],
            )
        )
    return sections


# ---------------------------------------------------------------------------
# Academic units
# ---------------------------------------------------------------------------

UnitKind = Literal[
    "college", "school", "campus", "center", "division", "program_group", "other"
]
PROFESSIONAL_SCHOOL = re.compile(
    r"\b(Law|Medicine|Dentistry|Pharmacy|Podiatric)\b", re.IGNORECASE
)
UNIT_KIND_RULES: tuple[tuple[UnitKind, re.Pattern[str]], ...] = (
    ("campus", re.compile(r"\bcampus\b|^Temple University ", re.IGNORECASE)),
    ("program_group", re.compile(r"\bprograms?\b", re.IGNORECASE)),
    ("college", re.compile(r"\bcollege\b", re.IGNORECASE)),
    ("school", re.compile(r"\bschool\b", re.IGNORECASE)),
    ("division", re.compile(r"\bdivision\b", re.IGNORECASE)),
    ("center", re.compile(r"\bcenter\b", re.IGNORECASE)),
)
# The chart's unit names spell out what page headings abbreviate or drop.
UNIT_NAME_REPLACEMENTS = (("&", " and "), ("’", "'"))


class AcademicUnit(Record):
    edition: str
    # The unit page's path within its edition: "undergraduate/science-technology",
    # "graduate/scd/fox". Stable across editions while Temple keeps the path.
    key: str
    name: str
    # The unit's own name when the heading names a parent too ("Center for … /
    # Boyer College of Music and Dance" → "Boyer College of Music and Dance").
    short_name: str
    kind: UnitKind
    level: str
    parent_key: str | None
    url: str
    # The Academic Programs Chart's school/college code ("ST", "LW"), if matched.
    unit_code: str | None
    professional_school: bool
    evidence: Evidence


def unit_key(url: str) -> str:
    return edition_path(url).strip("/")


def _normalized_name(name: str) -> str:
    for old, new in UNIT_NAME_REPLACEMENTS:
        name = name.replace(old, new)
    return clean_text(name).casefold()


def _unit_kind(name: str) -> UnitKind:
    return next(
        (kind for kind, pattern in UNIT_KIND_RULES if pattern.search(name)), "other"
    )


def match_unit_code(name: str, unit_names: dict[str, str]) -> str | None:
    """The chart code whose full name contains the unit's own name, if exactly
    one does ("Kornberg School of Dentistry" in "Maurice H. Kornberg School of
    Dentistry")."""
    wanted = _normalized_name(name)
    matches = [
        code
        for code, full_name in unit_names.items()
        if wanted in _normalized_name(full_name)
    ]
    return matches[0] if len(matches) == 1 else None


def _heading_evidence(document: PageDocument) -> Evidence:
    # The heading comes from the page's <h1>, which isn't one of its blocks, so
    # the citation is the page as a whole.
    return Evidence(
        url=document.url,
        sha256=document.sha256,
        locator=Locator(),
        text=document.heading,
    )


def academic_units(
    pages: Iterable[ExtractedPage], edition: str, index: ProgramIndex | None = None
) -> list[AcademicUnit]:
    unit_pages = [page for page in pages if page.kind is PageKind.ACADEMIC_UNIT]
    unit_urls = {page.document.url for page in unit_pages}
    unit_names = index.unit_names if index else {}
    units = []
    for page in unit_pages:
        document = page.document
        short_name = document.heading.split(" / ")[-1].strip()
        parent = next(
            (
                crumb.url
                for crumb in reversed(document.breadcrumbs[:-1])
                if crumb.url in unit_urls
            ),
            None,
        )
        units.append(
            AcademicUnit(
                edition=edition,
                key=unit_key(document.url),
                name=document.heading,
                short_name=short_name,
                kind=_unit_kind(short_name),
                level=page_level(document.url),
                parent_key=unit_key(parent) if parent else None,
                url=document.url,
                unit_code=match_unit_code(short_name, unit_names),
                professional_school=bool(PROFESSIONAL_SCHOOL.search(short_name)),
                evidence=_heading_evidence(document),
            )
        )
    return sorted(_inherit_unit_codes(units), key=lambda unit: unit.key)


def _inherit_unit_codes(units: list[AcademicUnit]) -> list[AcademicUnit]:
    """A unit the chart doesn't name (a college's program group) takes its
    parent's code, since the chart lists its programs under the parent."""
    by_key = {unit.key: unit for unit in units}
    for unit in units:
        parent = by_key.get(unit.parent_key or "")
        while unit.unit_code is None and parent is not None:
            unit.unit_code = parent.unit_code
            parent = by_key.get(parent.parent_key or "")
    return units


# ---------------------------------------------------------------------------
# Program metadata
# ---------------------------------------------------------------------------

CredentialType = Literal[
    "major",
    "degree",
    "minor",
    "certificate",
    "graduate_certificate",
    "post_masters_certificate",
    "concentration",
    "accelerated",
    "dual",
    "other",
]
DegreeLevel = Literal[
    "associate", "bachelor", "master", "specialist", "doctorate", "first_professional"
]
FIRST_PROFESSIONAL_AWARDS = frozenset({"JD", "MD", "DMD", "PharmD", "DPM"})
SPECIALIST_AWARDS = frozenset({"EdS"})
# Doctorates whose abbreviation doesn't start with "D" (or that do but aren't
# first-professional degrees are covered by the prefix rule).
DOCTORATE_AWARDS = frozenset({"PhD", "EdD", "OTD", "SJD"})
# Master's degrees whose abbreviation doesn't start with "M".
MASTER_AWARDS = frozenset({"LLM", "PSM"})
CAMPUS_FACTS = ("Campus Location", "Campus Locations")
CODE_FACTS = ("Program Code",)
FORMAT_FACTS = ("Delivery", "Program Format", "Full-Time/Part-Time Status")
FACT_LIST_SEPARATOR = re.compile(r"\s*(?:,|;|\band\b)\s*")
FACT_LIST_MAX_LENGTH = 60
SENTENCE_END = re.compile(r"[.:]\s|[.:]$")
PARENTHETICAL = re.compile(r"\([^)]*\)")
WITH_CONCENTRATION = re.compile(r"\bwith\b.+\bconcentrations?\b", re.IGNORECASE)
ACCELERATED = re.compile(r"\baccelerated\b|\b\d\s*\+\s*\d\b", re.IGNORECASE)
NOT_ACCEPTING = re.compile(r"not (currently )?(accepting|open)", re.IGNORECASE)
CHART_MARKERS = re.compile(r"[*^,\s]+")
APOSTROPHES = str.maketrans({"’": "'", "‘": "'"})


class ProgramFacts(Record):
    edition: str
    url: str
    name: str
    level: Literal["undergraduate", "graduate", "professional"]
    credential_type: CredentialType
    degree_level: DegreeLevel | None
    # The degree abbreviation as the chart spells it ("BS", "PhD", "PharmD").
    award: str | None
    award_name: str | None
    program_codes: list[str]
    campuses: list[str]
    # Delivery and format facts, verbatim, keyed by their label.
    formats: dict[str, str]
    unit_key: str | None
    unit_name: str | None
    unit_code: str | None
    professional_school: bool
    accepting_applications: bool | None
    # The chart's notes for this credential ("thesis", "not currently
    # accepting applications").
    status_notes: list[str]
    listing_evidence: list[Evidence]
    unresolved: list[str]


def chart_credential(listing: ProgramListing) -> str:
    return CHART_MARKERS.sub(" ", listing.credential).strip()


def _award_lookup(index: ProgramIndex | None) -> dict[str, str]:
    """Award abbreviations by their case-folded spelling, as the chart spells
    them ("bsbioe" → "BSBioe")."""
    awards = index.credential_names if index else {}
    lookup = {award.casefold(): award for award in awards}
    for award in FIRST_PROFESSIONAL_AWARDS | DOCTORATE_AWARDS | MASTER_AWARDS:
        lookup.setdefault(award.casefold(), award)
    return lookup


def awards_in_name(name: str, lookup: dict[str, str]) -> list[str]:
    """Award abbreviations the program name ends with or names before "with"
    ("Bioengineering BSBIOE with … Concentration" → ["BSBioe"])."""
    bare = clean_text(PARENTHETICAL.sub(" ", name))
    bare = re.split(r"\s+with\s+", bare, maxsplit=1, flags=re.IGNORECASE)[0]
    last_word = bare.rsplit(" ", 1)[-1]
    tokens = last_word.split("/")
    awards = [lookup.get(token.casefold()) for token in tokens]
    return [award for award in awards if award] if all(awards) else []


def degree_level(award: str) -> DegreeLevel:
    if award in FIRST_PROFESSIONAL_AWARDS:
        return "first_professional"
    if award in SPECIALIST_AWARDS:
        return "specialist"
    if award in DOCTORATE_AWARDS or award.startswith("D"):
        return "doctorate"
    if award in MASTER_AWARDS or award.startswith("M"):
        return "master"
    if award.startswith("A"):
        return "associate"
    return "bachelor"


def _credential_type(
    name: str,
    url: str,
    level: str,
    chart: str | None,
    awards: list[str],
) -> CredentialType | None:
    text = f"{name} {chart or ''}".translate(APOSTROPHES)
    if "Post-Master's" in text and re.search(r"cert", text, re.IGNORECASE):
        return "post_masters_certificate"
    if re.search(r"\bcert(ificate)?\b|\bcert\.", text, re.IGNORECASE):
        return "certificate" if level == "undergraduate" else "graduate_certificate"
    if re.search(r"\bminor\b", text, re.IGNORECASE):
        return "minor"
    if len(awards) > 1 or re.search(r"\b(dual|joint)\b", name, re.IGNORECASE):
        return "dual"
    if "/accelerated-programs/" in url or ACCELERATED.search(name):
        return "accelerated"
    if WITH_CONCENTRATION.search(name) or chart == "Conc.":
        return "concentration"
    if awards:
        if degree_level(awards[0]) in {"associate", "bachelor"}:
            return "major"
        return "degree"
    return None


def is_fact_list(value: str) -> bool:
    """A short list of names ("Main, Japan", "Main and Online"), not prose
    ("Health Sciences Center. With the permission of …")."""
    return len(value) <= FACT_LIST_MAX_LENGTH and not SENTENCE_END.search(value)


def _fact_values(program: ProgramPage, labels: Sequence[str]) -> list[str]:
    """The labeled facts' values, split into items when they're a short list
    and kept whole when they're prose."""
    values: list[str] = []
    for fact in program.facts:
        if fact.label not in labels:
            continue
        if is_fact_list(fact.value):
            values.extend(v for v in FACT_LIST_SEPARATOR.split(fact.value) if v)
        else:
            values.append(fact.value)
    return list(dict.fromkeys(values))


def _owning_unit(url: str, units: Sequence[AcademicUnit]) -> AcademicUnit | None:
    path = unit_key(url) + "/"
    candidates = [unit for unit in units if path.startswith(unit.key + "/")]
    return max(candidates, key=lambda unit: len(unit.key), default=None)


def describe_program(
    program: ProgramPage,
    index: ProgramIndex | None,
    edition: str,
    units: Sequence[AcademicUnit] = (),
) -> ProgramFacts:
    unresolved: list[str] = []
    listings = (
        [listing for listing in index.listings if listing.url == program.url]
        if index
        else []
    )
    if not listings:
        unresolved.append("not listed on the Academic Programs Chart")
    charts = list(dict.fromkeys(chart_credential(listing) for listing in listings))
    if len(charts) > 1:
        unresolved.append(f"chart lists several credentials: {', '.join(charts)}")
    chart = charts[0] if charts else None

    lookup = _award_lookup(index)
    awards = awards_in_name(program.name, lookup)
    if not awards and chart and chart.casefold() in lookup:
        awards = [lookup[chart.casefold()]]
    award = awards[0] if awards else None

    unit = _owning_unit(program.url, units)
    unit_name = (
        unit.short_name if unit else (program.units[-1] if program.units else None)
    )
    professional_school = bool(unit_name and PROFESSIONAL_SCHOOL.search(unit_name))
    if listings:
        level = listings[0].level
    elif award and degree_level(award) == "first_professional":
        level = "professional"
    else:
        level = "graduate" if program.level == "graduate" else "undergraduate"
        if professional_school:
            unresolved.append("professional school program; level taken from URL")

    credential = _credential_type(program.name, program.url, level, chart, awards)
    if credential is None:
        unresolved.append("credential type not recognized from name or chart")
    codes = _fact_values(program, CODE_FACTS)
    # Undergraduate pages print a Program Code; graduate pages mostly don't.
    if not codes and level == "undergraduate":
        unresolved.append("no Program Code printed")
    notes = list(dict.fromkeys(note for listing in listings for note in listing.notes))
    accepting = (
        None if not listings else not any(NOT_ACCEPTING.search(note) for note in notes)
    )
    return ProgramFacts(
        edition=edition,
        url=program.url,
        name=program.name,
        level=level,
        credential_type=credential or "other",
        degree_level=degree_level(award) if award else None,
        award=award,
        award_name=index.credential_names.get(award) if index and award else None,
        program_codes=codes,
        campuses=_fact_values(program, CAMPUS_FACTS),
        formats={
            fact.label: fact.value
            for fact in program.facts
            if fact.label in FORMAT_FACTS
        },
        unit_key=unit.key if unit else None,
        unit_name=unit_name,
        unit_code=(listings[0].unit_code or None)
        if listings
        else (unit.unit_code if unit else None),
        professional_school=professional_school,
        accepting_applications=accepting,
        status_notes=notes,
        listing_evidence=[listing.evidence for listing in listings],
        unresolved=unresolved,
    )


# ---------------------------------------------------------------------------
# Course designations (General Education area lists)
# ---------------------------------------------------------------------------

AREA_CODE = re.compile(r"\(([A-Z]{2}(?:\s*&\s*[A-Z]{2})?)\)\s*$")
DesignationRole = Literal["area_course", "waiver", "other"]
WAIVER = re.compile(r"\bwaivers?\b", re.IGNORECASE)


class CourseDesignation(Record):
    """A course a General Education page lists, under the list it sits in."""

    edition: str
    # The area code from the page heading ("GA", "GY & GZ").
    designation: str
    # "area_course": the area's own course list. "waiver": courses that waive
    # the requirement (GA, GB, GQ, GS). "other": a list the rules don't know.
    role: DesignationRole
    list_path: list[str]
    course: str
    # The list item's block index: courses sharing one are named together
    # (a waiver item can need "CHEM 1031 & 1033" both).
    item_index: int
    # An area course's title: the list item's text without its codes. Waiver
    # and other items are sentences, so only their evidence text is kept.
    title: str | None
    evidence: Evidence


def _designation_role(section: list[str]) -> DesignationRole:
    if any(WAIVER.search(heading) for heading in section):
        return "waiver"
    if len(section) == 1 and section[0].endswith("Courses"):
        return "area_course"
    return "other"


def course_designations(page: ExtractedPage, edition: str) -> list[CourseDesignation]:
    """Course codes linked from list items on a GenEd area page.

    The writing-intensive page publishes no course list (programs name their
    WI courses), and course listings carry WI and GenEd attributes themselves,
    so only GenEd area pages are read here.
    """
    document = page.document
    match = AREA_CODE.search(document.heading)
    if page.kind is not PageKind.GENERAL_EDUCATION or match is None:
        return []
    designation = match[1]
    blocks = {block.index: block for block in document.blocks}
    designations = []
    for link in document.links:
        block = blocks.get(link.block_index) if link.block_index is not None else None
        code = clean_text(link.text)
        if (
            block is None
            or block.kind != "list_item"
            or not COURSE_CODE.fullmatch(code)
        ):
            continue
        role = _designation_role(block.section)
        designations.append(
            CourseDesignation(
                edition=edition,
                designation=designation,
                role=role,
                list_path=block.section,
                course=code,
                item_index=block.index,
                title=clean_text(COURSE_CODE.sub("", block.text)).strip(" ,;")
                if role == "area_course"
                else None,
                evidence=document.evidence(block),
            )
        )
    return designations
