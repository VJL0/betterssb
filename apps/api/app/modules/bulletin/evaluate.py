"""Check a student's courses against a program's requirement tree.

Deterministic and conservative: an outcome is `satisfied` only when every
condition beneath it is interpreted and met by the record. Missing facts (a
grade not given, a course's attributes or credits unknown) give `unknown`, not
`not_satisfied`; milestones and partially interpreted rules give
`requires_review`; prose gives `unsupported`. Roots that aren't requirements
(admission, suggested plans, accelerated options) are `not_applicable`.

Courses counted toward more than one satisfied requirement are flagged for
review: whether Temple allows the overlap depends on rules the trees don't yet
express. Choosing the best allocation of courses across overlapping
requirements is a separate, later step.

Pure: no database, network or student data leaves the caller.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal

from pydantic import Field

from app.modules.bulletin.rules import (
    CourseFilter,
    Interpretation,
    Outcome,
    RequirementNode,
    RequirementTree,
    RuleModel,
    Validation,
)

# Temple's letter grades in order; other marks (P, CR, TR, I) are compared as
# unknown rather than guessed.
GRADE_ORDER = ("F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A")
APPLICABLE_ROLES = frozenset({"requirement", "curriculum"})
# When children disagree, the answer that most needs attention wins.
UNDECIDED_PRECEDENCE = (Outcome.UNSUPPORTED, Outcome.REQUIRES_REVIEW, Outcome.UNKNOWN)
OVERLAP_NOTE = (
    "a course counts toward more than one requirement; overlap rules aren't checked"
)
REVIEW_NOTE = "met as far as interpreted; the rule has conditions that need review"


@dataclass(frozen=True, slots=True)
class CompletedCourse:
    code: str
    credits: Decimal | None = None
    # Letter grade, or None when not known (in progress, transfer, pass/fail).
    grade: str | None = None
    # Banner attributes, or None when not known.
    attributes: frozenset[str] | None = None


class NodeResult(RuleModel):
    id: str
    outcome: Outcome
    # Courses this node's outcome relies on.
    used_courses: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    children: list[NodeResult] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class _Record:
    courses: Mapping[str, CompletedCourse]


def _grade_meets(grade: str | None, minimum: str | None) -> bool | None:
    if minimum is None:
        return True
    if grade not in GRADE_ORDER or minimum not in GRADE_ORDER:
        return None
    return GRADE_ORDER.index(grade) >= GRADE_ORDER.index(minimum)


def _undecided(outcomes: Iterable[Outcome]) -> Outcome:
    present = set(outcomes)
    return next((o for o in UNDECIDED_PRECEDENCE if o in present), Outcome.UNKNOWN)


def _filter_match(course: CompletedCourse, rule: CourseFilter) -> bool | None:
    """True, False, or None when the record can't tell."""
    subject, number = course.code.split(" ", 1)
    if course.code in rule.exclude_courses:
        return False
    if rule.subjects and subject not in rule.subjects:
        return False
    if rule.number_min and number < rule.number_min:
        return False
    if rule.number_max and number > rule.number_max:
        return False
    if rule.attributes:
        if course.attributes is None:
            return None
        if not set(rule.attributes) & course.attributes:
            return False
    # Course level isn't in the record; numbering alone doesn't settle it.
    return None if rule.level else True


def _leaf_course(node: RequirementNode, record: _Record) -> NodeResult:
    course = record.courses.get(node.course or "")
    if course is None:
        return NodeResult(id=node.id, outcome=Outcome.NOT_SATISFIED)
    meets = _grade_meets(course.grade, node.min_grade)
    if meets is None:
        return NodeResult(
            id=node.id,
            outcome=Outcome.UNKNOWN,
            notes=[f"grade needed to check minimum {node.min_grade}"],
        )
    if not meets:
        return NodeResult(id=node.id, outcome=Outcome.NOT_SATISFIED)
    return NodeResult(id=node.id, outcome=Outcome.SATISFIED, used_courses=[course.code])


def _credits_of(codes: Iterable[str], record: _Record) -> Decimal | None:
    total = Decimal(0)
    for code in codes:
        credits = record.courses[code].credits
        if credits is None:
            return None
        total += credits
    return total


def _leaf_filter(node: RequirementNode, record: _Record) -> NodeResult:
    sure: list[str] = []
    maybe: list[str] = []
    for course in record.courses.values():
        match = _filter_match(course, node.course_filter or CourseFilter())
        grade = _grade_meets(course.grade, node.min_grade)
        if match is False or grade is False:
            continue
        (sure if match and grade else maybe).append(course.code)
    needed_courses = node.min_courses or (0 if node.min_credits else 1)
    sure_credits = _credits_of(sure, record)
    met = len(sure) >= needed_courses and (
        node.min_credits is None
        or (sure_credits is not None and sure_credits >= node.min_credits)
    )
    if met:
        return NodeResult(
            id=node.id, outcome=Outcome.SATISFIED, used_courses=sorted(sure)
        )
    if not maybe and (
        len(sure) < needed_courses
        or (sure_credits is not None and node.min_credits is not None)
    ):
        return NodeResult(id=node.id, outcome=Outcome.NOT_SATISFIED)
    return NodeResult(
        id=node.id,
        outcome=Outcome.UNKNOWN,
        notes=["the record doesn't show whether some courses match"],
    )


def _overlaps(children: list[NodeResult]) -> bool:
    seen: set[str] = set()
    for child in children:
        if child.outcome is Outcome.SATISFIED:
            if seen & set(child.used_courses):
                return True
            seen |= set(child.used_courses)
    return False


def _used(children: Iterable[NodeResult]) -> list[str]:
    return sorted(
        {
            c
            for child in children
            if child.outcome is Outcome.SATISFIED
            for c in child.used_courses
        }
    )


def _combine_all(node: RequirementNode, children: list[NodeResult]) -> NodeResult:
    relevant = [c for c in children if c.outcome is not Outcome.NOT_APPLICABLE]
    if any(c.outcome is Outcome.NOT_SATISFIED for c in relevant):
        outcome = Outcome.NOT_SATISFIED
    elif all(c.outcome is Outcome.SATISFIED for c in relevant):
        outcome = Outcome.SATISFIED
    else:
        outcome = _undecided(c.outcome for c in relevant)
    return NodeResult(
        id=node.id, outcome=outcome, used_courses=_used(children), children=children
    )


def _combine_any(node: RequirementNode, children: list[NodeResult]) -> NodeResult:
    relevant = [c for c in children if c.outcome is not Outcome.NOT_APPLICABLE]
    chosen = next((c for c in relevant if c.outcome is Outcome.SATISFIED), None)
    if chosen is not None:
        return NodeResult(
            id=node.id,
            outcome=Outcome.SATISFIED,
            used_courses=chosen.used_courses,
            children=children,
        )
    if all(c.outcome is Outcome.NOT_SATISFIED for c in relevant):
        return NodeResult(id=node.id, outcome=Outcome.NOT_SATISFIED, children=children)
    undecided = (c.outcome for c in relevant if c.outcome is not Outcome.NOT_SATISFIED)
    return NodeResult(id=node.id, outcome=_undecided(undecided), children=children)


def _combine_choose(
    node: RequirementNode, children: list[NodeResult], record: _Record
) -> NodeResult:
    if node.min_courses is None and node.min_credits is None:
        return _combine_any(node, children)
    satisfied = [c for c in children if c.outcome is Outcome.SATISFIED]
    undecided = [
        c
        for c in children
        if c.outcome
        not in {Outcome.SATISFIED, Outcome.NOT_SATISFIED, Outcome.NOT_APPLICABLE}
    ]
    used = _used(satisfied)
    credits = _credits_of(used, record)
    count_met = node.min_courses is None or len(satisfied) >= node.min_courses
    credits_met = node.min_credits is None or (
        credits is not None and credits >= node.min_credits
    )
    if count_met and credits_met:
        outcome = Outcome.SATISFIED
    elif not undecided and (not count_met or credits is not None):
        outcome = Outcome.NOT_SATISFIED
    else:
        outcome = (
            _undecided(c.outcome for c in undecided) if undecided else Outcome.UNKNOWN
        )
    notes = (
        [] if credits is not None or node.min_credits is None else ["credits unknown"]
    )
    return NodeResult(
        id=node.id, outcome=outcome, used_courses=used, notes=notes, children=children
    )


def evaluate_node(node: RequirementNode, record: _Record) -> NodeResult:
    match node.kind:
        case "course":
            result = _leaf_course(node, record)
        case "course_filter":
            result = _leaf_filter(node, record)
        case "milestone":
            result = NodeResult(
                id=node.id,
                outcome=Outcome.REQUIRES_REVIEW,
                notes=[f"{node.milestone or 'milestone'} isn't in a course record"],
            )
        case "text":
            result = NodeResult(id=node.id, outcome=Outcome.UNSUPPORTED)
        case _:
            children = [evaluate_node(child, record) for child in node.children]
            if node.kind == "all":
                result = _combine_all(node, children)
            elif node.kind == "any":
                result = _combine_any(node, children)
            else:
                result = _combine_choose(node, children, record)
            if node.kind != "any" and _overlaps(children):
                result.notes.append(OVERLAP_NOTE)
                if result.outcome is Outcome.SATISFIED:
                    result.outcome = Outcome.REQUIRES_REVIEW
    uncertain = (
        node.interpretation is not Interpretation.INTERPRETED
        or node.validation is Validation.FAILED
    )
    if uncertain and result.outcome is Outcome.SATISFIED:
        result.outcome = Outcome.REQUIRES_REVIEW
        result.notes.append(REVIEW_NOTE)
    return result


def evaluate_tree(
    tree: RequirementTree, courses: Iterable[CompletedCourse]
) -> NodeResult:
    """The program's outcome over its requirement and curriculum roots."""
    record = _Record({course.code: course for course in courses})
    roots = []
    for root in tree.roots:
        if root.role in APPLICABLE_ROLES:
            roots.append(evaluate_node(root, record))
        else:
            roots.append(
                NodeResult(
                    id=root.id, outcome=Outcome.NOT_APPLICABLE, notes=[root.role]
                )
            )
    if not any(r.outcome is not Outcome.NOT_APPLICABLE for r in roots):
        return NodeResult(
            id="program",
            outcome=Outcome.UNSUPPORTED,
            notes=["no interpreted requirement or curriculum"],
            children=roots,
        )
    result = _combine_all(RequirementNode(id="program", kind="all"), roots)
    if _overlaps(roots):
        result.notes.append(OVERLAP_NOTE)
        if result.outcome is Outcome.SATISFIED:
            result.outcome = Outcome.REQUIRES_REVIEW
    return result
