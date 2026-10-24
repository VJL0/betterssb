"""Banner's printed prerequisites and corequisites as a rule tree.

Banner prints them in one grammar:

    Minimum grade of C- (except where noted) in (MATH 0702 (C or higher),
    any MATH course numbered 1021 to 4999 (may be taken concurrently),
    'Y' in MC4, or STAT 1102)

A list's last conjunction applies to the whole list ("A, B, or C"), and
parentheses group. Anything else (GPA minimums, "9 credits in 3400-level GAD
courses") becomes a TEXT node, so the tree is PARTIAL rather than wrong.
"""

from __future__ import annotations

import re

from app.modules.bulletin.ingest.rules import (
    SUBJECT,
    RuleNodeDraft,
    clean_text,
    course_node,
    text_node,
)
from app.modules.bulletin.models import ParseStatus, RuleNodeType

GRADE = r"[A-D][+-]?"
DEFAULT_GRADE = re.compile(
    rf"^Minimum grade of (?P<grade>{GRADE})(?: \(except where noted\))? in:? ",
    re.IGNORECASE,
)
# "(C or higher; may be taken concurrently)" after an item.
MODIFIERS = re.compile(r"\s*\((?P<modifiers>[^()]*)\)$")
GRADE_MODIFIER = re.compile(rf"^(?P<grade>{GRADE}) or higher$", re.IGNORECASE)
CONCURRENT_MODIFIER = "may be taken concurrently"
COURSE = re.compile(rf"^(?P<subject>{SUBJECT}) (?P<number>[0-9]{{4}}|[A-Z][0-9]{{3}})$")
COURSE_RANGE = re.compile(
    rf"^(?:any )?(?P<subject>{SUBJECT}) courses? numbered "
    r"(?P<low>[0-9]{4}) to (?P<high>[0-9]{4})$",
    re.IGNORECASE,
)
# "any 2000-level PSY course"
COURSE_LEVEL = re.compile(
    rf"^any (?P<level>[0-9])000-level (?P<subject>{SUBJECT}) course$", re.IGNORECASE
)
TEST = re.compile(r"^'(?P<score>[^']+)' in (?P<test>[A-Z0-9]+)$")
ATTRIBUTE = re.compile(
    r'^any course with attribute "?(?P<attribute>[A-Z0-9]+)"?$', re.IGNORECASE
)
# "Complete 3 of the following: A, B, and C" takes the rest of its list.
CHOOSE = re.compile(
    r"^Completed? (?P<count>[0-9]+) of the following:\s*", re.IGNORECASE
)
SEPARATOR = re.compile(r",\s*(?:(and|or)\s+)?|\s+(and|or)\s+", re.IGNORECASE)


def parse_prerequisites(text: str) -> RuleNodeDraft:
    body = clean_text(text).rstrip(" .")
    grade = None
    if match := DEFAULT_GRADE.match(body):
        grade = match["grade"].upper()
        body = body[match.end() :]
    return _parse_expression(body.strip(), grade)


def _split_top_level(text: str) -> tuple[list[str], list[str | None]] | None:
    """Split on commas and and/or outside parentheses; None if they don't balance.

    Returns the items and, for each gap between two items, its conjunction.
    """
    items: list[str] = []
    joins: list[str | None] = []
    depth = 0
    start = index = 0
    while index < len(text):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth < 0:
                return None
        elif depth == 0 and (separator := SEPARATOR.match(text, index)):
            items.append(text[start:index].strip())
            conjunction = separator[1] or separator[2]
            joins.append(conjunction.lower() if conjunction else None)
            index = start = separator.end()
            continue
        index += 1
    if depth != 0:
        return None
    items.append(text[start:].strip())
    return items, joins


def _parse_expression(text: str, grade: str | None) -> RuleNodeDraft:
    split = _split_top_level(text)
    if split is None or not all(split[0]):
        return text_node(text)
    items, joins = split
    if len(items) == 1:
        return _parse_item(items[0], grade)

    children: list[RuleNodeDraft] = []
    for position, item in enumerate(items):
        if choose := CHOOSE.match(item):
            rest = [item[choose.end() :], *items[position + 1 :]]
            children.append(_choose_node(rest, int(choose["count"]), grade))
            joins = joins[:position]
            break
        children.append(_parse_item(item, grade))

    conjunctions = {join for join in joins if join}
    if len(conjunctions) > 1:
        # "A and B or C" without parentheses: Banner's own precedence isn't printed.
        return text_node(text)
    node = RuleNodeDraft(
        RuleNodeType.ANY if conjunctions == {"or"} else RuleNodeType.ALL,
        source_text=text,
        children=children,
    )
    if not conjunctions and len(children) > 1:
        # A bare comma list ("MGRE 3196, SPED 3187"): most likely all of them.
        node.parse_status = ParseStatus.PARTIAL
        node.params["implicit_conjunction"] = True
    return node


def _choose_node(items: list[str], count: int, grade: str | None) -> RuleNodeDraft:
    return RuleNodeDraft(
        RuleNodeType.COUNT,
        label=f"Complete {count} of the following",
        source_text=", ".join(items),
        min_count=count,
        children=[_parse_item(item, grade) for item in items],
    )


def _wrapped_in_parentheses(text: str) -> bool:
    if not (text.startswith("(") and text.endswith(")")):
        return False
    depth = 0
    for index, char in enumerate(text):
        depth += {"(": 1, ")": -1}.get(char, 0)
        if depth == 0 and index < len(text) - 1:
            return False
    return True


def _item_modifiers(text: str, grade: str | None) -> tuple[str, dict[str, object]]:
    """Strip a trailing grade/concurrency parenthetical; return the rest and params."""
    params: dict[str, object] = {}
    core = text
    if (match := MODIFIERS.search(text)) and match.start() > 0:
        parts = [part.strip() for part in match["modifiers"].split(";")]
        recognized = True
        for part in parts:
            if part.lower() == CONCURRENT_MODIFIER:
                params["concurrent"] = True
            elif grade_match := GRADE_MODIFIER.match(part):
                grade = grade_match["grade"].upper()
            else:
                recognized = False
        if recognized:
            core = text[: match.start()].strip()
        else:
            params.pop("concurrent", None)
    if grade:
        params["min_grade"] = grade
    return core, params


def _parse_item(text: str, grade: str | None) -> RuleNodeDraft:
    if _wrapped_in_parentheses(text):
        return _parse_expression(text[1:-1].strip(), grade)

    core, params = _item_modifiers(text, grade)
    if match := COURSE.match(core):
        return course_node(match["subject"], match["number"], text, **params)
    if match := COURSE_RANGE.match(core):
        return _range_node(text, match["subject"], match["low"], match["high"], params)
    if match := COURSE_LEVEL.match(core):
        level = match["level"]
        return _range_node(text, match["subject"], f"{level}000", f"{level}999", params)
    if match := TEST.match(core):
        return RuleNodeDraft(
            RuleNodeType.TEST,
            label=core,
            source_text=text,
            params={"test": match["test"], "score": match["score"]},
        )
    if match := ATTRIBUTE.match(core):
        return RuleNodeDraft(
            RuleNodeType.ATTRIBUTE,
            label=core,
            source_text=text,
            attribute=match["attribute"],
            params=params,
        )
    return text_node(text, params=params)


def _range_node(
    text: str, subject: str, low: str, high: str, params: dict[str, object]
) -> RuleNodeDraft:
    return RuleNodeDraft(
        RuleNodeType.COURSE_RANGE,
        label=f"{subject} {low}–{high}",
        source_text=text,
        params={**params, "subject": subject.upper(), "low": low, "high": high},
    )
