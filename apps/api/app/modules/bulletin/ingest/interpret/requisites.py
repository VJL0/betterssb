"""Prerequisites and corequisites, from Banner's generated wording to a
`RequisiteExpression` tree.

Banner prints every condition in one grammar:

    Minimum grade of C- (except where noted) in (A or B), (C, D, or E), and
    (F (C or higher; may be taken concurrently), any MATH course numbered 1038
    to 4999, 'Y' in MC6, any course with attribute "GQ")

A list's items are joined by commas with the conjunction before the last item
("A, B, and C"), parentheses group, and a parenthesized note after an item
lowers its grade or lets it be taken concurrently. A list head ending in a
colon takes the rest of its list as operands: "Complete 2 of the following:"
and "16 credits needed:" become `choose`, "minimum GPA of 3 in:" puts `min_gpa`
on what follows. Counted course sets ("2 3000-level ADV courses", "9 credits
in ART 3101") are filters or courses with `min_count` / `min_credits`.

Unknown heads and course sets printed without a quantity become `condition`
nodes that keep their wording and mark the passage partial. Anything outside
the grammar is kept as `text`; nothing is guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

from app.modules.bulletin.ingest.extract.courses import (
    COREQUISITE_LABEL,
    COURSE_CODE,
    PREREQUISITE_LABEL,
    CourseRecord,
)
from app.modules.bulletin.rules import (
    CourseFilter,
    Interpretation,
    Requisite,
    RequisiteExpression,
)

RequisiteKind = Literal["prerequisite", "corequisite"]

REQUISITE_LABELS: dict[str, RequisiteKind] = {
    PREREQUISITE_LABEL: "prerequisite",
    COREQUISITE_LABEL: "corequisite",
}

GRADE = r"[A-Z]{1,2}[+-]?"
GRADE_PREFIX = re.compile(
    rf"^Minimum grade of (?P<grade>{GRADE})(?: \(except where noted\))? in "
)
# "(C or higher)", "(may be taken concurrently)", "(CR or higher; may be taken
# concurrently)": a note on the item before it, not a group.
ITEM_NOTE = re.compile(
    rf"\((?:(?P<grade>{GRADE}) or higher)?(?:; )?"
    r"(?P<concurrent>may be taken concurrently)?\)"
)
TOKEN = re.compile(
    r"(?P<punct>[(),])|(?P<word>and|or)\b"
    r"|(?P<atom>[^(),]+?)(?=\s*(?:[(),]|\band\b|\bor\b|$))"
)
LIST_HEAD = re.compile(r"^(?P<head>[^:]+:)\s*(?P<rest>.*)$")
COUNT_HEAD = re.compile(
    r"^(?:Completed?|Select) (?P<count>\d+) (?:of|from) the following:$"
)
ALL_HEAD = re.compile(r"^Completed? the following:$")
CREDITS_HEAD = re.compile(r"^(?P<credits>\d+(?:\.\d+)?) credits needed:$")
GPA_HEAD = re.compile(r"^minimum GPA of (?P<gpa>\d+(?:\.\d+)?) in:$")

SUBJECT = r"[A-Z]{2,5}"
NUMBER = r"[0-9][0-9A-Z]{3,4}|[A-Z][0-9]{3}"
COURSE = re.compile(rf"^{SUBJECT} (?:{NUMBER})$")
TEST_SCORE = re.compile(r"^'(?P<score>[^']*)' in (?P<test>[A-Z0-9]+)$")
ATTRIBUTE = re.compile(r'^any course with attribute "(?P<attribute>[^"]+)"$')
# "any MATH course numbered 1038 to 4999", "CHEM courses numbered 1021 to 1024"
NUMBERED = re.compile(
    rf"^(?:(?P<subject>{SUBJECT}) )?courses? numbered "
    r"(?P<low>[0-9A-Z]{4}) to (?P<high>[0-9A-Z]{4})$"
)
# "2000-level PSY course", "3400-level GAD courses"
LEVELED = re.compile(rf"^(?P<level>\d{{2}})00-level (?P<subject>{SUBJECT}) courses?$")
# "2 3000-level ADV courses", "9 credits in 3600-level ART courses"
AMOUNT = re.compile(r"^(?P<amount>\d+) (?P<credits>credits in )?(?P<rest>.+)$")


class RequisiteSyntaxError(ValueError):
    """The passage doesn't follow Banner's grammar closely enough to trust any
    structure read from it."""


@dataclass(slots=True)
class Token:
    kind: Literal["(", ")", ",", "and", "or", "atom", "head", "note"]
    text: str


@dataclass(slots=True)
class ParseContext:
    notes: list[str] = field(default_factory=list)

    def note(self, message: str) -> None:
        if message not in self.notes:
            self.notes.append(message)


def _atom_tokens(text: str) -> list[Token]:
    """An atom, split after a list head's colon ("Complete 2 of the following:
    ISE 3102" is a head and its first operand)."""
    if head := LIST_HEAD.match(text):
        tokens = [Token("head", head["head"])]
        return tokens + ([Token("atom", head["rest"])] if head["rest"] else [])
    return [Token("atom", text)]


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    position = 0
    while position < len(text):
        if text[position].isspace():
            position += 1
            continue
        note = ITEM_NOTE.match(text, position)
        if (
            note
            and (note["grade"] or note["concurrent"])
            and tokens
            and tokens[-1].kind in {"atom", ")"}
        ):
            tokens.append(Token("note", note[0]))
            position = note.end()
            continue
        match = TOKEN.match(text, position)
        if match is None:
            raise RequisiteSyntaxError(f"cannot read from {text[position:]!r}")
        if match["punct"]:
            tokens.append(Token(match["punct"], match["punct"]))  # type: ignore[arg-type]
        elif match["word"]:
            tokens.append(Token(match["word"], match["word"]))  # type: ignore[arg-type]
        else:
            tokens.extend(_atom_tokens(match["atom"].strip()))
        position = match.end()
    return tokens


class Parser:
    """Recursive descent over `tokenize`'s output."""

    def __init__(self, tokens: list[Token], context: ParseContext) -> None:
        self.tokens = tokens
        self.position = 0
        self.context = context
        # Inside "minimum GPA of 3 in:", a bare course set is the GPA's scope.
        self.sets_are_scopes = False

    def peek(self) -> Token | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def take(self) -> Token:
        token = self.peek()
        if token is None:
            raise RequisiteSyntaxError("passage ends early")
        self.position += 1
        return token

    def parse(self) -> RequisiteExpression:
        expression = self.parse_list()
        if (extra := self.peek()) is not None:
            raise RequisiteSyntaxError(f"unexpected {extra.text!r}")
        return expression

    def parse_list(self, operands: bool = False) -> RequisiteExpression:
        """Items up to `)` or the end. A head's operands end sooner, at the item
        after their own conjunction: in "(Complete the following: A, B, and C
        or D)", D is the head's alternative, not its operand."""
        items: list[RequisiteExpression] = []
        conjunctions: set[str] = set()
        while True:
            head = self.peek()
            is_head = head is not None and head.kind == "head"
            items.append(self.parse_head() if is_head else self.parse_item())
            if operands and conjunctions:
                break
            token = self.peek()
            if token is None or token.kind == ")":
                break
            separator = self.take()
            if separator.kind == ",":
                following = self.peek()
                if following is not None and following.kind in {"and", "or"}:
                    conjunctions.add(self.take().kind)
            elif separator.kind in {"and", "or"}:
                conjunctions.add(separator.kind)
            else:
                raise RequisiteSyntaxError(
                    f"expected a separator, found {separator.text!r}"
                )
        return self.combine(items, conjunctions, operands)

    def parse_head(self) -> RequisiteExpression:
        """A list head and the rest of its list."""
        head = self.take().text
        if gpa := GPA_HEAD.match(head):
            return self.parse_gpa_scope(Decimal(gpa["gpa"]))
        operands = self.parse_list(operands=True)
        listed = operands.children if operands.kind == "all" else [operands]
        # "Select 2 from the following: A, B, or C" names candidates either way.
        candidates = (
            operands.children if operands.kind in {"all", "any"} else [operands]
        )
        if count := COUNT_HEAD.match(head):
            return RequisiteExpression(
                kind="choose", min_count=int(count["count"]), children=candidates
            )
        if credits := CREDITS_HEAD.match(head):
            return RequisiteExpression(
                kind="choose",
                min_credits=Decimal(credits["credits"]),
                children=candidates,
            )
        if ALL_HEAD.match(head):
            return RequisiteExpression(kind="all", children=listed)
        self.context.note(f"condition kept as text: {head!r}")
        return RequisiteExpression(kind="condition", text=head, children=listed)

    def parse_gpa_scope(self, gpa: Decimal) -> RequisiteExpression:
        """A GPA over a course set is the filter itself; over listed courses,
        an `all` of them."""
        enclosing, self.sets_are_scopes = self.sets_are_scopes, True
        try:
            scope = self.parse_list(operands=True)
        finally:
            self.sets_are_scopes = enclosing
        if scope.kind not in {"course_filter", "all"}:
            scope = RequisiteExpression(kind="all", children=[scope])
        scope.min_gpa = gpa
        return scope

    def combine(
        self, items: list[RequisiteExpression], conjunctions: set[str], operands: bool
    ) -> RequisiteExpression:
        if len(items) == 1:
            return items[0]
        if len(conjunctions) > 1:
            raise RequisiteSyntaxError("a list mixes 'and' and 'or' without grouping")
        if not conjunctions:
            if not operands:
                self.context.note("list has no printed conjunction; read as all")
            return RequisiteExpression(kind="all", children=items)
        kind = "all" if "and" in conjunctions else "any"
        return RequisiteExpression(kind=kind, children=items)

    def parse_item(self) -> RequisiteExpression:
        token = self.take()
        if token.kind == "(":
            item = self.parse_list()
            if self.take().kind != ")":
                raise RequisiteSyntaxError("unbalanced parentheses")
        elif token.kind == "atom":
            item = parse_atom(token.text, self.context, self.sets_are_scopes)
        else:
            raise RequisiteSyntaxError(f"expected an item, found {token.text!r}")
        while (note := self.peek()) is not None and note.kind == "note":
            apply_note(item, ITEM_NOTE.fullmatch(self.take().text))
        return item


def apply_note(item: RequisiteExpression, note: re.Match[str] | None) -> None:
    if note is None:
        return
    if note["grade"]:
        item.min_grade = note["grade"]
    if note["concurrent"]:
        item.concurrent = True


def course_set(text: str) -> CourseFilter | None:
    """The courses a phrase ranges over, without saying how many are needed."""
    if match := NUMBERED.match(text):
        return CourseFilter(
            subjects=[match["subject"]] if match["subject"] else [],
            number_min=match["low"],
            number_max=match["high"],
        )
    if match := LEVELED.match(text):
        return CourseFilter(
            subjects=[match["subject"]],
            number_min=f"{match['level']}00",
            number_max=f"{match['level'][0]}999"
            if match["level"].endswith("0")
            else f"{match['level']}99",
        )
    return None


def parse_atom(
    text: str, context: ParseContext, sets_are_scopes: bool = False
) -> RequisiteExpression:
    if COURSE.match(text):
        return RequisiteExpression(kind="course", course=text)
    if match := TEST_SCORE.match(text):
        return RequisiteExpression(
            kind="test", test=match["test"], score=match["score"]
        )
    if match := ATTRIBUTE.match(text):
        return RequisiteExpression(
            kind="course_filter",
            course_filter=CourseFilter(attributes=[match["attribute"]]),
        )
    if text.startswith("any ") and (courses := course_set(text[len("any ") :])):
        return RequisiteExpression(kind="course_filter", course_filter=courses)
    if (amount := AMOUNT.match(text)) and (counted := counted_courses(amount)):
        return counted
    if sets_are_scopes and (courses := course_set(text)):
        return RequisiteExpression(kind="course_filter", course_filter=courses)
    if courses := course_set(text):
        context.note(f"quantity not printed: {text!r}")
        return RequisiteExpression(kind="condition", text=text, course_filter=courses)
    context.note(f"not understood: {text!r}")
    return RequisiteExpression(kind="text", text=text)


def counted_courses(amount: re.Match[str]) -> RequisiteExpression | None:
    """ "2 3000-level ADV courses", "9 credits in ART courses numbered 3600 to
    3699", "6 credits in ART 3101"."""
    rest = amount["rest"]
    bound = (
        {"min_credits": Decimal(amount["amount"])}
        if amount["credits"]
        else {"min_count": int(amount["amount"])}
    )
    if COURSE.match(rest):
        return RequisiteExpression(kind="course", course=rest, **bound)
    if courses := course_set(rest):
        return RequisiteExpression(kind="course_filter", course_filter=courses, **bound)
    return None


def mentioned_courses(text: str) -> list[str]:
    return list(
        dict.fromkeys(
            f"{subject} {number}" for subject, number in COURSE_CODE.findall(text)
        )
    )


def _interpretation(
    expression: RequisiteExpression, context: ParseContext
) -> Interpretation:
    if expression.kind == "text":
        return Interpretation.UNINTERPRETED
    return Interpretation.PARTIAL if context.notes else Interpretation.INTERPRETED


def parse_requisite_text(kind: RequisiteKind, text: str) -> Requisite:
    source_text = text.strip()
    body = source_text.removesuffix(".").strip()
    context = ParseContext()
    min_grade = None
    if grade := GRADE_PREFIX.match(body):
        min_grade = grade["grade"]
        body = body[grade.end() :]
    try:
        expression = Parser(tokenize(body), context).parse()
    except RequisiteSyntaxError as error:
        return Requisite(
            kind=kind,
            source_text=source_text,
            expression=RequisiteExpression(kind="text", text=source_text),
            interpretation=Interpretation.UNINTERPRETED,
            notes=[str(error)],
            courses=mentioned_courses(source_text),
        )
    if min_grade is not None and expression.min_grade is None:
        expression.min_grade = min_grade
    return Requisite(
        kind=kind,
        source_text=source_text,
        expression=expression,
        interpretation=_interpretation(expression, context),
        notes=context.notes,
        courses=mentioned_courses(source_text),
    )


def interpret_requisites(course: CourseRecord) -> list[Requisite]:
    return [
        parse_requisite_text(REQUISITE_LABELS[part.label], part.text)
        for part in course.parts
        if part.label in REQUISITE_LABELS
    ]
