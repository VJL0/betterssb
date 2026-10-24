"""A program page's requirement tables as `RequirementTree`s.

CourseLeaf prints a requirement table as flat rows; the grouping lives in row
classes, indentation and wording:

- an area header (`tr.areaheader`, "Core Courses") opens a group that runs to
  the next area header at its indentation or shallower, or the total;
- a comment row worded as a selection ("Select two of the following:",
  "Select 15-16 credits from…", "Take any combination…") or ending in a colon
  opens a group over the rows indented beneath it, or, when nothing is
  indented, over the rows that follow up to the next header;
- an `or` row (`tr.orclass`) is an alternative to the item before it;
- a code cell printing "A & B" needs both courses;
- the `Total Credit Hours` row is what the table adds up to.

The rest of a comment row's wording is matched against a few patterns Temple
uses for open-ended slots ("2000+ ARTH elective", "GenEd 08xx or 09xx (Human
Behavior)", "Free Electives") and named milestones (recitals, theses, exams).
Anything else stays as published text, marked uninterpreted, so nothing
unclear is guessed into a rule.

The one deterministic check is arithmetic: when every part of a table states
its hours, their sum must equal the printed total. A tree whose sum matches is
`structurally_checked`; one that contradicts its total is `failed`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.tables import (
    CourseListTable,
    PlanGrid,
    PlanRow,
    TableRow,
)
from app.modules.bulletin.rules import (
    CourseFilter,
    Interpretation,
    MilestoneKind,
    RequirementNode,
    RequirementTree,
    RootRole,
    SourceRef,
    Validation,
    expand_course_code,
)

NUMBER_WORDS = {
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
    "eleven": 11,
    "twelve": 12,
}
NUMBER = r"\d+(?:\.\d+)?|" + "|".join(NUMBER_WORDS)
COUNT = r"(?P<count>\d+|a|an|" + "|".join(NUMBER_WORDS) + r")"
CREDIT_RANGE = r"(?P<low>\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(?P<high>\d+(?:\.\d+)?))?"
# "a minimum of", "at least", "a total of" between the verb and the number.
QUANTIFIER = r"(?:(?:a\s+)?(?:minimum|total)\s+of\s+|at\s+least\s+)?"
CREDIT_WORD = r"(?:credits?|credit\s+hours?|s\.h\.|semester\s+hours?)\b"

SELECTION_VERB = re.compile(
    r"^\s*(?:students\s+(?:must|should)\s+)?(?:select|choose|take|complete|pick)\b",
    re.IGNORECASE,
)
# "Select 15-16 credits from", "Take a total of three Music Studies elective
# credits": a number, up to a few describing words, then a credit unit.
SELECTED_CREDITS = re.compile(
    r"\b(?:select|choose|take|complete)\s+"
    + QUANTIFIER
    + r"(?P<low>"
    + NUMBER
    + r")(?:\s*(?:-|–|to)\s*(?P<high>\d+(?:\.\d+)?))?"
    + r"(?:\s+(?!of\b|from\b|the\b|following\b|courses?\b)[\w&/-]+){0,4}?\s*"
    + CREDIT_WORD,
    re.IGNORECASE,
)
SELECTED_COUNT = re.compile(
    r"\b(?:select|choose|take|complete|pick)\s+"
    + QUANTIFIER
    + r"(?:any\s+)?"
    + COUNT
    + r"\b",
    re.IGNORECASE,
)
EITHER = re.compile(r"\b(?:select|choose|take|complete)\s+either\b", re.IGNORECASE)
ANY_COMBINATION = re.compile(r"\bany\s+combination\b", re.IGNORECASE)
CHOSEN_FROM = re.compile(
    r"\b(?:chosen|selected)\s+from\b|\bselect\s+from\b", re.IGNORECASE
)
# "Select at most three credits of Independent Study".
AT_MOST_CREDITS = re.compile(
    r"\b(?:select|choose|take|count)\s+(?:up\s+to|at\s+most|no\s+more\s+than)\s+"
    r"(?P<count>" + NUMBER + r")"
    r"(?:\s+(?!of\b|from\b|the\b|following\b|courses?\b)[\w&/-]+){0,4}?\s*"
    + CREDIT_WORD,
    re.IGNORECASE,
)
AT_MOST = re.compile(
    r"\b(?:select|choose|take)\s+(?:up\s+to|at\s+most|no\s+more\s+than)\s+"
    + COUNT
    + r"\b",
    re.IGNORECASE,
)
# Plan and offering legends CourseLeaf prints inside requirement tables.
OFFERING_NOTE = re.compile(
    r"^\s*(?:\((?:F|S|SU|SE|SO|FE|FO|O|Y)\)\s*(?:-|=)|note\s*:)", re.IGNORECASE
)

GENED_SLOT = re.compile(
    r"\bGenEd\s+(?P<first>\d{2})xx(?:\s+or\s+(?P<second>\d{2})xx)?\s*\((?P<area>[^)]+)\)",
    re.IGNORECASE,
)
# The General Education area names, as Temple's GenEd pages title them, and the
# Banner course attribute each area's courses carry
# (/undergraduate/general-education/<code>/).
GENED_AREAS = {
    "arts": "GA",
    "the arts": "GA",
    "human behavior": "GB",
    "race and diversity": "GD",
    "race & diversity": "GD",
    "global/world society": "GG",
    "quantitative literacy": "GQ",
    "science and technology": "GS",
    "science & technology": "GS",
    "u.s. society": "GU",
    "us society": "GU",
    "analytical reading and writing": "GW",
    "analytical reading & writing": "GW",
}
SUBJECTS = r"(?P<subjects>[A-Z]{2,5}(?:\s*(?:,|/|or|and)\s*[A-Z]{2,5})*)"
ELECTIVE_WORDS = r"(?P<rest>.*)$"
NUMBER_FLOOR_SLOT = re.compile(
    r"^\s*(?P<floor>\d{4})\+\s+" + SUBJECTS + r"\b" + ELECTIVE_WORDS
)
NUMBER_RANGE_SLOT = re.compile(
    r"^\s*" + SUBJECTS + r"\s+(?P<low>\d{4})\s*-\s*(?P<high>\d{4})\b" + ELECTIVE_WORDS
)
LEVEL_SLOT = re.compile(
    r"^\s*" + SUBJECTS + r"\s+(?P<level>\d)000[\s-]*(?i:level)"
    r"(?P<above>\s+(?i:or\s+(?:above|higher)))?\b" + ELECTIVE_WORDS
)
FREE_ELECTIVE = re.compile(r"^\s*free\s+electives?\s*$", re.IGNORECASE)
PLAIN_SLOT_WORDS = re.compile(r"^\s*(?:electives?|courses?)?\s*$", re.IGNORECASE)

MILESTONES: list[tuple[re.Pattern[str], MilestoneKind]] = [
    (re.compile(r"^\s*(?:doctoral\s+)?dissertation\b", re.IGNORECASE), "dissertation"),
    (re.compile(r"^\s*(?:master'?s\s+)?thesis\b", re.IGNORECASE), "thesis"),
    (re.compile(r"\bcandidacy\b", re.IGNORECASE), "candidacy"),
    (re.compile(r"\b(?:exam|examination)s?\b", re.IGNORECASE), "examination"),
    (re.compile(r"\brecital\b", re.IGNORECASE), "recital"),
    (re.compile(r"\bportfolio\b", re.IGNORECASE), "portfolio"),
    (re.compile(r"\bpracticum\b", re.IGNORECASE), "practicum"),
    (re.compile(r"\binternship\b", re.IGNORECASE), "internship"),
    (re.compile(r"\b(?:clerkship|rotation)s?\b", re.IGNORECASE), "clinical"),
]
# Slots for courses are not milestones, whatever their topic.
COURSE_SLOT_WORDS = re.compile(
    r"\b(?:electives?|courses?|coursework|any)\b", re.IGNORECASE
)
# Option headings: groups that are alternatives to each other.
OPTION_HEADING = re.compile(
    r"\b(?:sequence|option|track|concentration|pathway)\b", re.IGNORECASE
)

# Totals printed as ordinary rows ("Total FMA Credit Hours:", "Minimum Hours
# Required for Graduation") rather than CourseLeaf's `listsum` row.
TOTAL_WORDING = re.compile(
    r"^\s*(?:total\b.*\b(?:credits?|hours)|minimum\s+hours\s+required)\b"
    r"|\bcredit\s+hours\s*:?\s*$",
    re.IGNORECASE,
)
NOTE_SUBTOTAL = "printed subtotal, not a requirement of its own"

HOURS = re.compile(r"^\s*" + CREDIT_RANGE + r"\s*$")

Credits = tuple[Decimal, Decimal]

# "CIS 4X9X", "BIOL 4XXX": any course whose number fits the pattern.
WILDCARD_CODE = re.compile(
    r"^\s*(?P<subject>[A-Z]{2,5})\s+(?P<number>(?=[0-9X]*X)(?=[0-9X]*[0-9])[0-9X]{4})\s*$"
)
# Conditions a row's title states beside the course ("cannot be taken in
# addition to PDMD P331", "must be completed at Temple", "taken six times").
CONDITION_WORDING = re.compile(
    r"\b(?:cannot|can\s+not|may\s+not|must|only\s+if|only\s+when|unless|"
    r"in\s+addition\s+to|at\s+temple|instead\s+of|in\s+place\s+of|"
    r"(?:\d+|two|three|four|five|six|seven|eight|several)\s+times)\b",
    re.IGNORECASE,
)

NOTE_OFFERING = "offering-pattern legend, not a requirement"
NOTE_UNLINKED = "course printed without a catalog link"
NOTE_PLAN = "published as a semester sequence; order is not a requirement"
NOTE_LEGEND_ONLY = "table holds only offering legends; not a requirement"
NOTE_UNCHECKED_WORDING = (
    "rows add up to the printed total, but uninterpreted wording keeps it unverified"
)
NOTE_UNCOUNTED = "selection count not stated; any one of the listed items is assumed"


def parse_hours(text: str) -> Credits | None:
    """ "4" → (4, 4); "15-16" → (15, 16); anything else → None."""
    match = HOURS.match(text)
    if match is None:
        return None
    try:
        low = Decimal(match["low"])
        high = Decimal(match["high"]) if match["high"] else low
    except InvalidOperation:
        return None
    return (low, high) if low <= high else None


def _count(word: str) -> int | None:
    word = word.lower()
    if word in {"a", "an"}:
        return 1
    return int(word) if word.isdigit() else NUMBER_WORDS.get(word)


def _amount(word: str) -> Decimal:
    word = word.lower()
    return Decimal(NUMBER_WORDS[word]) if word in NUMBER_WORDS else Decimal(word)


def _subjects(text: str) -> list[str]:
    return re.findall(r"[A-Z]{2,5}", text)


@dataclass(frozen=True, slots=True)
class Selection:
    """What a group header's wording asks for."""

    min_courses: int | None = None
    max_courses: int | None = None
    min_credits: Decimal | None = None
    max_credits: Decimal | None = None
    # The header is worded as a choice but gives no count.
    uncounted: bool = False


def selection(text: str) -> Selection | None:
    """The choice a header's wording asks for, or None if it isn't a choice."""
    if match := SELECTED_CREDITS.search(text):
        low = _amount(match["low"])
        high = Decimal(match["high"]) if match["high"] else None
        return Selection(min_credits=low, max_credits=high)
    if EITHER.search(text):
        return Selection(min_courses=1)
    if match := AT_MOST_CREDITS.search(text):
        return Selection(max_credits=_amount(match["count"]))
    if (match := AT_MOST.search(text)) and (count := _count(match["count"])):
        return Selection(max_courses=count)
    if ANY_COMBINATION.search(text):
        return Selection(uncounted=True)
    if (match := SELECTED_COUNT.search(text)) and (count := _count(match["count"])):
        return Selection(min_courses=count)
    if SELECTION_VERB.search(text) or CHOSEN_FROM.search(text):
        return Selection(uncounted=True)
    return None


def is_offering_note(text: str) -> bool:
    return bool(OFFERING_NOTE.search(text))


def slot_filter(text: str) -> tuple[CourseFilter, list[str]] | None:
    """An open-ended slot's course filter and what it leaves out, if its wording
    is one of the patterns Temple uses."""
    if match := GENED_SLOT.search(text):
        area = GENED_AREAS.get(match["area"].strip().lower())
        if area is None:
            return None
        series = [match["first"], match["second"] or match["first"]]
        return (
            CourseFilter(
                attributes=[area],
                number_min=f"{min(series)}00",
                number_max=f"{max(series)}99",
            ),
            [],
        )
    if FREE_ELECTIVE.match(text):
        return CourseFilter(), [
            "university limits on what counts as a free elective are not captured"
        ]
    for pattern in (NUMBER_FLOOR_SLOT, NUMBER_RANGE_SLOT, LEVEL_SLOT):
        if match := pattern.match(text):
            break
    else:
        return None
    groups = match.groupdict()
    if pattern is NUMBER_FLOOR_SLOT:
        number_min, number_max = groups["floor"], None
    elif pattern is NUMBER_RANGE_SLOT:
        number_min, number_max = groups["low"], groups["high"]
    else:
        number_min = f"{groups['level']}000"
        number_max = None if groups["above"] else f"{groups['level']}999"
    notes = []
    rest = groups["rest"].strip(" .:;")
    if not PLAIN_SLOT_WORDS.match(rest):
        notes.append(f"qualifier not captured: {rest!r}")
    return (
        CourseFilter(
            subjects=_subjects(groups["subjects"]),
            number_min=number_min,
            number_max=number_max,
        ),
        notes,
    )


def milestone(text: str) -> MilestoneKind | None:
    if COURSE_SLOT_WORDS.search(text):
        return None
    return next((kind for pattern, kind in MILESTONES if pattern.search(text)), None)


def _row_text(row: TableRow) -> str:
    parts = [row.code_text, row.title, row.comment, row.hours]
    return " | ".join(part for part in parts if part)


def code_fields(code: str, node_id: str, source: SourceRef) -> dict:
    """A printed course code as node fields: one course, the codes of a
    cross-listed course as alternatives, a wildcard ("CIS 4X9X") as a number
    range, or text if it isn't a code."""
    if match := WILDCARD_CODE.match(code):
        number = match["number"]
        return {
            "kind": "course_filter",
            "label": code,
            "course_filter": CourseFilter(
                subjects=[match["subject"]],
                number_min=number.replace("X", "0"),
                number_max=number.replace("X", "9"),
            ),
            "interpretation": Interpretation.PARTIAL,
            "notes": ["wildcard course number read as a number range"],
        }
    codes = expand_course_code(code)
    if len(codes) == 1:
        return {"kind": "course", "course": codes[0]}
    if not codes or any(WILDCARD_CODE.match(listed) for listed in codes):
        return {
            "kind": "text",
            "label": code,
            "interpretation": Interpretation.UNINTERPRETED,
            "notes": [f"{code!r} is not a course code"],
        }
    return {
        "kind": "any",
        "label": code,
        "children": [
            RequirementNode(
                id=f"{node_id}.x{position}",
                kind="course",
                course=listed,
                source_text=code,
                sources=[source],
            )
            for position, listed in enumerate(codes)
        ],
        "notes": [f"cross-listed under {len(codes)} codes"],
    }


def text_fields(text: str, node_id: str, source: SourceRef) -> dict:
    """A row printed as words: a subtotal or legend, an unlinked course code,
    an open-ended slot, a named milestone, or published wording kept as is."""
    if TOTAL_WORDING.search(text):
        return {
            "kind": "text",
            "label": text,
            "interpretation": Interpretation.UNINTERPRETED,
            "notes": [NOTE_SUBTOTAL],
        }
    if is_offering_note(text):
        return {
            "kind": "text",
            "label": text,
            "interpretation": Interpretation.UNINTERPRETED,
            "notes": [NOTE_OFFERING],
        }
    if WILDCARD_CODE.match(text) or expand_course_code(text):
        fields = code_fields(text, node_id, source)
        fields["notes"] = [*fields.get("notes", []), NOTE_UNLINKED]
        return fields
    if found := slot_filter(text):
        course_filter, notes = found
        fields = {
            "kind": "course_filter",
            "label": text,
            "course_filter": course_filter,
            "interpretation": (
                Interpretation.PARTIAL if notes else Interpretation.INTERPRETED
            ),
            "notes": notes,
        }
        return _condition_fields(fields, text)
    if kind := milestone(text):
        return {
            "kind": "milestone",
            "label": text,
            "milestone": kind,
            "interpretation": Interpretation.PARTIAL,
            "notes": ["milestone named; its conditions are in the program's prose"],
        }
    return {
        "kind": "text",
        "label": text,
        "interpretation": Interpretation.UNINTERPRETED,
        "notes": ["published wording only; not expressed as a rule"],
    }


def _condition(text: str) -> str | None:
    # Upper-case matches are subject codes ("MUST 1000-4999"), not words.
    worded = any(
        not match.group().isupper() for match in CONDITION_WORDING.finditer(text)
    )
    return text if worded else None


def _condition_fields(fields: dict, text: str) -> dict:
    if (condition := _condition(text)) is None:
        return fields
    return {
        **fields,
        "interpretation": Interpretation.PARTIAL,
        "notes": [*fields.get("notes", []), f"condition not captured: {condition!r}"],
    }


def footnote_conditions(node: RequirementNode) -> RequirementNode:
    """The node, marked partial if a footnote on its row states a condition
    ("must be completed at Temple")."""
    for footnote in node.footnotes:
        node = with_condition(node, footnote, "footnote condition not captured")
    return node


def with_condition(
    node: RequirementNode, text: str, note: str = "condition not captured"
) -> RequirementNode:
    """The node, marked partial if its printed title states a condition the
    structure doesn't carry ("cannot be taken in addition to…")."""
    if (condition := _condition(text)) is None:
        return node
    interpretation = (
        node.interpretation
        if node.interpretation is Interpretation.UNINTERPRETED
        else Interpretation.PARTIAL
    )
    return node.model_copy(
        update={
            "interpretation": interpretation,
            "notes": [*node.notes, f"{note}: {condition!r}"],
        }
    )


class _TableReader:
    """Reads one table's rows into nodes, front to back."""

    def __init__(self, table: CourseListTable, footnotes: dict[str, str]):
        self.table = table
        self.rows = table.rows
        self.footnotes = footnotes
        self.prefix = f"t{table.index}"

    def source(self, row: TableRow) -> SourceRef:
        return SourceRef(
            url=self.table.evidence.url,
            sha256=self.table.evidence.sha256,
            xpath=row.locator.xpath,
            line=row.locator.line,
            tab=self.table.tab,
            text=_row_text(row),
        )

    def node(self, row: TableRow, parent: str, **fields) -> RequirementNode:
        notes = list(fields.pop("notes", []))
        footnotes = []
        for marker in row.footnotes:
            if marker in self.footnotes:
                footnotes.append(f"[{marker}] {self.footnotes[marker]}")
            else:
                notes.append(f"footnote {marker!r} is not printed under the table")
        return footnote_conditions(
            RequirementNode(
                id=f"{parent}.r{row.index}",
                hours_text=row.hours,
                footnotes=footnotes,
                source_text=_row_text(row),
                sources=[self.source(row)],
                notes=notes,
                **fields,
            )
        )

    # Course rows -----------------------------------------------------------

    def course_row(self, row: TableRow, parent: str) -> RequirementNode:
        return with_condition(self._course_row(row, parent), row.title)

    def _course_row(self, row: TableRow, parent: str) -> RequirementNode:
        node_id = f"{parent}.r{row.index}"
        if len(row.courses) == 1:
            return self.node(
                row, parent, **code_fields(row.courses[0], node_id, self.source(row))
            )
        kind = "any" if row.joiner == "or" else "all"
        notes = (
            []
            if row.joiner
            else ["code cell names several courses without '&' or 'or'"]
        )
        leaves = []
        for position, code in enumerate(row.courses):
            leaf_id = f"{node_id}.c{position}"
            leaves.append(
                RequirementNode(
                    id=leaf_id,
                    source_text=code,
                    sources=[self.source(row)],
                    **code_fields(code, leaf_id, self.source(row)),
                )
            )
        return self.node(
            row,
            parent,
            kind=kind,
            label=row.code_text,
            children=leaves,
            interpretation=(
                Interpretation.PARTIAL if notes else Interpretation.INTERPRETED
            ),
            notes=notes,
        )

    def with_alternatives(
        self, first: RequirementNode, alternatives: list[TableRow]
    ) -> RequirementNode:
        """An item followed by `or` rows: any one of them. The group takes the
        first item's id; the item moves beneath it."""
        group_id = first.id
        first = _reid(first, f"{group_id}.{group_id.rsplit('.', 1)[1]}")
        members = [first] + [
            self.course_row(row, group_id) if row.courses else self.leaf(row, group_id)
            for row in alternatives
        ]
        return RequirementNode(
            id=group_id,
            kind="any",
            label=" or ".join(m.course or m.label or m.source_text for m in members),
            children=members,
            hours_text=first.hours_text,
            source_text=" / ".join(m.source_text for m in members),
            sources=[source for m in members for source in m.sources],
        )

    # Text rows -------------------------------------------------------------

    def leaf(self, row: TableRow, parent: str) -> RequirementNode:
        text = row.comment or row.title or row.code_text
        fields = text_fields(text, f"{parent}.r{row.index}", self.source(row))
        return self.node(row, parent, **fields)

    # Groups ----------------------------------------------------------------

    def is_header(self, position: int) -> bool:
        row = self.rows[position]
        if TOTAL_WORDING.search(row.comment):
            return False
        if row.kind == "area_header":
            return True
        if row.kind != "comment" or is_offering_note(row.comment):
            return False
        following = self.rows[position + 1] if position + 1 < len(self.rows) else None
        indented = (
            following is not None
            and following.kind != "total"
            and following.indent > row.indent
        )
        if indented:
            return True
        if following is None or following.kind == "total":
            return False
        if row.comment.rstrip().endswith(":"):
            return True
        # "Select either Residency or Non-Residency…" over the groups after it.
        return bool(
            EITHER.search(row.comment)
            and following.kind == "comment"
            and following.indent == row.indent
            and self.is_header(position + 1)
        )

    def region_end(self, position: int, end: int) -> int:
        """Where the group opened at `position` stops (exclusive)."""
        row = self.rows[position]
        following = position + 1
        if following < end and self.rows[following].indent > row.indent:
            stop = following
            while (
                stop < end
                and self.rows[stop].indent > row.indent
                and self.rows[stop].kind != "total"
            ):
                stop += 1
            return stop
        if (
            row.kind == "comment"
            and following < end
            and self.rows[following].kind == "comment"
            and self.rows[following].indent == row.indent
            and self.is_header(following)
        ):
            # "Select either A or B" over the groups printed after it.
            stop = following
            while (
                stop < end
                and self.rows[stop].kind == "comment"
                and self.rows[stop].indent == row.indent
                and self.is_header(stop)
            ):
                stop = self.region_end(stop, end)
            return stop
        stop = following
        while stop < end:
            candidate = self.rows[stop]
            if candidate.kind == "total" or candidate.indent < row.indent:
                break
            if candidate.indent <= row.indent and (
                candidate.kind == "area_header"
                or (row.kind == "comment" and self.is_header(stop))
            ):
                break
            stop += 1
        return stop

    def group(
        self, position: int, end: int, parent: str
    ) -> tuple[RequirementNode, int]:
        row = self.rows[position]
        stop = self.region_end(position, end)
        node_id = f"{parent}.r{row.index}"
        children = self.items(position + 1, stop, node_id)
        text = row.comment
        if not children:
            return self.leaf(row, parent), stop
        chosen = selection(text)
        fields: dict = {"label": text, "children": children}
        hours = parse_hours(row.hours)
        if chosen is not None:
            fields["kind"] = "choose"
            if chosen.uncounted:
                if hours is not None:
                    fields["min_credits"], fields["max_credits"] = _bounds(hours)
                    fields["notes"] = [
                        "credit bound taken from the hours printed beside the header"
                    ]
                    fields["interpretation"] = Interpretation.PARTIAL
                else:
                    fields["kind"] = "any"
                    fields["notes"] = [NOTE_UNCOUNTED]
                    fields["interpretation"] = Interpretation.PARTIAL
            else:
                fields["min_courses"] = chosen.min_courses
                fields["max_courses"] = chosen.max_courses
                fields["min_credits"] = chosen.min_credits
                fields["max_credits"] = chosen.max_credits
        elif hours is not None and not _sum_matches(children, hours):
            fields["kind"] = "choose"
            fields["min_credits"], fields["max_credits"] = _bounds(hours)
            fields["interpretation"] = Interpretation.PARTIAL
            fields["notes"] = [
                "header's hours differ from its rows' sum; read as a credit choice"
            ]
        else:
            fields["kind"] = "all"
        return self.node(row, parent, **fields), stop

    def items(self, start: int, end: int, parent: str) -> list[RequirementNode]:
        nodes: list[RequirementNode] = []
        position = start
        while position < end:
            row = self.rows[position]
            if row.kind in {"empty", "total"}:
                position += 1
                continue
            if row.kind == "alternative" and nodes:
                alternatives = []
                while position < end and self.rows[position].kind == "alternative":
                    alternatives.append(self.rows[position])
                    position += 1
                nodes[-1] = self.with_alternatives(nodes[-1], alternatives)
                continue
            if self.is_header(position):
                node, position = self.group(position, end, parent)
                nodes.append(node)
                continue
            if row.courses:
                nodes.append(self.course_row(row, parent))
            else:
                nodes.append(self.leaf(row, parent))
            position += 1
        return nodes


def _reid(node: RequirementNode, new_id: str) -> RequirementNode:
    """The node and its descendants under a new id prefix."""
    old = node.id
    return node.model_copy(
        update={
            "id": new_id,
            "children": [
                _reid(child, new_id + child.id[len(old) :]) for child in node.children
            ],
        }
    )


def _bounds(hours: Credits) -> tuple[Decimal, Decimal | None]:
    low, high = hours
    return low, high if high != low else None


def credits(node: RequirementNode) -> Credits | None:
    """The hours a node accounts for, when every part of it says so."""
    if node.kind == "text" and (
        NOTE_OFFERING in node.notes or NOTE_SUBTOTAL in node.notes
    ):
        return (Decimal(0), Decimal(0))
    if (hours := parse_hours(node.hours_text)) is not None:
        return hours
    if node.kind == "all" and node.children:
        parts = [credits(child) for child in node.children]
        if any(part is None for part in parts):
            return None
        return (
            sum((part[0] for part in parts), Decimal(0)),
            sum((part[1] for part in parts), Decimal(0)),
        )
    if node.kind == "choose" and node.min_credits is not None:
        return node.min_credits, node.max_credits or node.min_credits
    return None


def _sum_matches(children: list[RequirementNode], hours: Credits) -> bool:
    total = credits(RequirementNode(id="sum", kind="all", children=children))
    return total == hours


def _mark_checked(node: RequirementNode) -> RequirementNode:
    validation = (
        node.validation
        if node.interpretation is Interpretation.UNINTERPRETED
        else Validation.STRUCTURALLY_CHECKED
    )
    return node.model_copy(
        update={
            "validation": validation,
            "children": [_mark_checked(child) for child in node.children],
        }
    )


def _options_root(children: list[RequirementNode]) -> bool:
    """Every top-level group is named as an option ("Biology Sequence")."""
    groups = [child for child in children if child.kind != "text"]
    return len(groups) > 1 and all(
        child.children and OPTION_HEADING.search(child.label) for child in groups
    )


def interpret_table(table: CourseListTable) -> RequirementNode:
    footnotes = {footnote.marker: footnote.text for footnote in table.footnotes}
    reader = _TableReader(table, footnotes)
    root_id = reader.prefix
    children = reader.items(0, len(table.rows), root_id)
    totals = [row for row in table.rows if row.kind == "total"]
    worded = False
    if not totals and (last := _last_row(table)) is not None and _is_worded_total(last):
        totals, worded = [last], True
    notes: list[str] = []
    fields: dict = {}
    kind = "all"
    interpretation = Interpretation.INTERPRETED
    if _options_root(children):
        kind = "any"
        interpretation = Interpretation.PARTIAL
        notes.append("groups are headed as options; read as alternatives to each other")
    if any(
        child.interpretation is not Interpretation.INTERPRETED
        for child in _walk(children)
    ):
        interpretation = Interpretation.PARTIAL
    printed = parse_hours(totals[-1].hours) if totals else None
    if len(totals) > 1:
        notes.append(
            f"{len(totals)} total rows; the last is taken as the table's total"
        )
    if totals:
        fields["hours_text"] = totals[-1].hours
    if printed is not None:
        fields["min_credits"], fields["max_credits"] = _bounds(printed)
    root = RequirementNode(
        id=root_id,
        kind=kind,
        label=table.section[-1] if table.section else "",
        children=children,
        source_text=table.evidence.text,
        sources=[
            SourceRef(
                url=table.evidence.url,
                sha256=table.evidence.sha256,
                xpath=table.evidence.locator.xpath,
                line=table.evidence.locator.line,
                tab=table.tab,
                text=table.evidence.text,
            )
        ],
        interpretation=interpretation,
        notes=notes,
        **fields,
    )
    role = section_role(table.tab, table.section)
    if (
        role == "requirement"
        and children
        and all(NOTE_OFFERING in child.notes for child in children)
    ):
        role = "other"
        root = root.model_copy(update={"notes": [*root.notes, NOTE_LEGEND_ONLY]})
    checked = _check_total(root, printed, bool(totals), worded)
    return settle(checked.model_copy(update={"role": role}))


def section_role(tab: str | None, section: list[str]) -> RootRole:
    """What a table or plan grid is for, from the tab and headings it sits
    under."""
    tab = (tab or "").lower()
    headings = " ".join(section).lower()
    if "admission" in tab or "prepharmacy" in tab or "pre-pharmacy" in headings:
        return "admission"
    if "academicplan" in tab or "academic plan" in headings:
        return "academic_plan"
    if "accelerated" in tab:
        return "accelerated"
    # Overview tabs list deficiency, honors or prerequisite courses beside the
    # program; ROTC pages list course offerings.
    if tab == "textcontainer" or "course offerings" in headings:
        return "other"
    return "requirement"


def settle(node: RequirementNode) -> RequirementNode:
    """Statuses that agree with the node's descendants: a parent is no more
    interpreted than its parts, and nothing holding uninterpreted wording is
    reported as checked."""
    children = [settle(child) for child in node.children]
    update: dict = {"children": children}
    if node.interpretation is Interpretation.INTERPRETED and any(
        child.interpretation is not Interpretation.INTERPRETED for child in children
    ):
        update["interpretation"] = Interpretation.PARTIAL
    if node.validation is Validation.STRUCTURALLY_CHECKED and any(
        _uninterpreted_within(child) for child in children
    ):
        update["validation"] = Validation.UNVERIFIED
        if node.id.count(".") == 0:
            update["notes"] = [*node.notes, NOTE_UNCHECKED_WORDING]
    return node.model_copy(update=update)


def _uninterpreted_within(node: RequirementNode) -> bool:
    return node.interpretation is Interpretation.UNINTERPRETED or any(
        _uninterpreted_within(child) for child in node.children
    )


# Plan grids ------------------------------------------------------------------


def _plan_row_text(row: PlanRow) -> str:
    parts = [row.code_text, row.title, row.hours]
    return " | ".join(part for part in parts if part)


class _PlanReader:
    """Reads a plan grid into a curriculum: every term's rows, in order."""

    def __init__(self, grid: PlanGrid):
        self.grid = grid
        self.footnotes = {footnote.marker: footnote.text for footnote in grid.footnotes}

    def source(self, locator_xpath: str | None, line: int | None, text: str):
        return SourceRef(
            url=self.grid.evidence.url,
            sha256=self.grid.evidence.sha256,
            xpath=locator_xpath,
            line=line,
            tab=self.grid.tab,
            text=text,
        )

    def row_source(self, row: PlanRow) -> SourceRef:
        return self.source(row.locator.xpath, row.locator.line, _plan_row_text(row))

    def node(self, row: PlanRow, node_id: str, **fields) -> RequirementNode:
        notes = list(fields.pop("notes", []))
        footnotes = []
        for marker in row.footnotes:
            if marker in self.footnotes:
                footnotes.append(f"[{marker}] {self.footnotes[marker]}")
            else:
                notes.append(f"footnote {marker!r} is not printed under the plan")
        return footnote_conditions(
            RequirementNode(
                id=node_id,
                hours_text=row.hours,
                footnotes=footnotes,
                source_text=_plan_row_text(row),
                sources=[self.row_source(row)],
                notes=notes,
                **fields,
            )
        )

    def course(self, row: PlanRow, node_id: str) -> RequirementNode:
        source = self.row_source(row)
        if len(row.courses) == 1:
            node = self.node(
                row, node_id, **code_fields(row.courses[0], node_id, source)
            )
            return with_condition(node, row.title)
        text = row.code_text.lower()
        notes = []
        if "&" in text:
            kind = "all"
        elif " or " in text or "/" in text:
            kind = "any"
        else:
            kind = "all"
            notes.append("code cell names several courses without '&' or 'or'")
        leaves = [
            RequirementNode(
                id=f"{node_id}.c{position}",
                source_text=code,
                sources=[source],
                **code_fields(code, f"{node_id}.c{position}", source),
            )
            for position, code in enumerate(row.courses)
        ]
        node = self.node(
            row,
            node_id,
            kind=kind,
            label=row.code_text,
            children=leaves,
            interpretation=(
                Interpretation.PARTIAL if notes else Interpretation.INTERPRETED
            ),
            notes=notes,
        )
        return with_condition(node, row.title)

    def rows(self, rows: list[PlanRow], term_id: str) -> list[RequirementNode]:
        nodes: list[RequirementNode] = []
        position = 0
        while position < len(rows):
            row = rows[position]
            node_id = f"{term_id}.r{position}"
            if row.kind in {"term_total", "plan_total"}:
                position += 1
                continue
            if row.kind == "course":
                nodes.append(self.course(row, node_id))
                position += 1
                continue
            text = row.code_text or row.title
            chosen = selection(text) if text.rstrip().endswith(":") else None
            members = []
            following = position + 1
            # A plan grid has no indentation: the hourless course rows after a
            # "Select one of the following:" row are its options.
            while (
                chosen is not None
                and following < len(rows)
                and rows[following].kind == "course"
                and not rows[following].hours
            ):
                members.append(self.course(rows[following], f"{node_id}.r{following}"))
                following += 1
            if members:
                bounds = (
                    {"kind": "any"}
                    if chosen.uncounted
                    else {
                        "kind": "choose",
                        "min_courses": chosen.min_courses,
                        "max_courses": chosen.max_courses,
                        "min_credits": chosen.min_credits,
                        "max_credits": chosen.max_credits,
                    }
                )
                nodes.append(
                    self.node(
                        row,
                        node_id,
                        label=text,
                        children=members,
                        interpretation=Interpretation.PARTIAL,
                        notes=["options inferred from the hourless rows after it"],
                        **bounds,
                    )
                )
                position = following
                continue
            nodes.append(
                self.node(
                    row, node_id, **text_fields(text, node_id, self.row_source(row))
                )
            )
            position += 1
        return nodes

    def root(self) -> RequirementNode:
        grid = self.grid
        root_id = f"p{grid.index}"
        years: dict[str, int] = {}
        terms = []
        for position, term in enumerate(grid.terms):
            year = years.setdefault(term.year, len(years))
            term_id = f"{root_id}.y{year}.t{position}"
            totals = [row for row in term.rows if row.kind == "term_total"]
            anchor = totals[0] if totals else (term.rows[0] if term.rows else None)
            label = " ".join(part for part in (term.year, term.term) if part)
            terms.append(
                RequirementNode(
                    id=term_id,
                    kind="all",
                    label=label,
                    children=self.rows(term.rows, term_id),
                    hours_text=totals[0].hours if totals else "",
                    source_text=label,
                    sources=[
                        self.row_source(anchor)
                        if anchor is not None
                        else self.source(
                            grid.evidence.locator.xpath,
                            grid.evidence.locator.line,
                            label,
                        )
                    ],
                )
            )
        return RequirementNode(
            id=root_id,
            kind="all",
            role="curriculum",
            label=grid.section[-1] if grid.section else "",
            children=terms,
            hours_text=grid.total_hours,
            source_text=grid.evidence.text,
            sources=[
                self.source(
                    grid.evidence.locator.xpath,
                    grid.evidence.locator.line,
                    grid.evidence.text,
                )
            ],
            interpretation=Interpretation.PARTIAL,
            notes=[NOTE_PLAN],
        )


def interpret_plan(grid: PlanGrid) -> RequirementNode:
    return settle(_PlanReader(grid).root())


def _last_row(table: CourseListTable) -> TableRow | None:
    return next((row for row in reversed(table.rows) if row.kind != "empty"), None)


def _is_worded_total(row: TableRow) -> bool:
    return bool(row.hours and not row.courses and TOTAL_WORDING.search(row.comment))


def _check_total(
    root: RequirementNode, printed: Credits | None, has_total: bool, worded: bool
) -> RequirementNode:
    if not has_total:
        return root.model_copy(update={"notes": root.notes + ["no printed total"]})
    if printed is None:
        return root.model_copy(
            update={"notes": root.notes + [f"total not numeric: {root.hours_text!r}"]}
        )
    if root.kind != "all":
        return root.model_copy(
            update={"notes": root.notes + ["total not checked for alternative groups"]}
        )
    if all(NOTE_SUBTOTAL in child.notes for child in root.children):
        return root.model_copy(
            update={"notes": root.notes + ["table lists subtotals only; not checked"]}
        )
    summed = credits(root.model_copy(update={"hours_text": ""}))
    if summed is None:
        return root.model_copy(
            update={
                "notes": root.notes + ["total not checked: some rows give no hours"]
            }
        )
    if summed == printed:
        return _mark_checked(root)
    if printed[0] == printed[1] and summed[0] == printed[0]:
        # "Total Credit Hours 60" over rows of 60-62: the total is the minimum.
        checked = _mark_checked(root)
        return checked.model_copy(
            update={
                "notes": checked.notes
                + [
                    f"printed total {_format(printed)} is the minimum of {_format(summed)}"
                ]
            }
        )
    if worded:
        # "Total FMA Credit Hours" can count tables printed before this one.
        return root.model_copy(
            update={
                "notes": root.notes
                + [
                    (
                        f"worded total {_format(printed)} differs from the rows' "
                        f"{_format(summed)}; it may count other tables"
                    )
                ]
            }
        )
    return root.model_copy(
        update={
            "validation": Validation.FAILED,
            "notes": root.notes
            + [f"rows add up to {_format(summed)}, table prints {_format(printed)}"],
        }
    )


def _format(hours: Credits) -> str:
    low, high = hours
    return (
        f"{low.normalize():f}"
        if low == high
        else f"{low.normalize():f}-{high.normalize():f}"
    )


def _walk(nodes: list[RequirementNode]):
    for node in nodes:
        yield node
        yield from _walk(node.children)


def walk(tree: RequirementTree):
    """Every node in the tree, depth first."""
    yield from _walk(tree.roots)


def interpret_program(program: ProgramPage) -> RequirementTree:
    """Every requirement table's tree; when a program publishes no requirement
    table, its plan grids stand in as curriculum roots."""
    roots = [interpret_table(table) for table in program.tables]
    if not any(root.role == "requirement" for root in roots):
        roots += [
            interpret_plan(grid)
            for grid in program.plans
            if section_role(grid.tab, grid.section) == "requirement"
        ]
    return RequirementTree(program_url=program.url, roots=roots)
