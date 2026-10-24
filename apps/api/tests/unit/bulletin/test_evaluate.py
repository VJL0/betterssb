"""The degree evaluator on hand-built trees and on real program trees
(fixtures/requirements), including properties checked over random records."""

from __future__ import annotations

import random
from decimal import Decimal
from pathlib import Path

import pytest

from app.modules.bulletin.evaluate import (
    OVERLAP_NOTE,
    CompletedCourse,
    NodeResult,
    evaluate_tree,
)
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.interpret.requirements import interpret_program
from app.modules.bulletin.rules import (
    CourseFilter,
    Interpretation,
    Outcome,
    RequirementNode,
    RequirementTree,
)

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
SEED = 20261024
RANDOM_RECORDS = 40
THREE = Decimal(3)


def course(
    code: str, grade: str | None = "A", credits: Decimal | None = THREE
) -> CompletedCourse:
    subject = code.split(" ")[0]
    return CompletedCourse(code, credits, grade, frozenset({subject}))


def leaf(node_id: str, code: str, **fields) -> RequirementNode:
    return RequirementNode(id=node_id, kind="course", course=code, **fields)


def tree(*roots: RequirementNode) -> RequirementTree:
    return RequirementTree(
        program_url="https://bulletin.temple.edu/x/", roots=list(roots)
    )


def outcome(root: RequirementNode, *courses: CompletedCourse) -> Outcome:
    return evaluate_tree(tree(root), courses).outcome


def test_course_needs_the_course_and_grade() -> None:
    node = leaf("t0", "CIS 1068", min_grade="C-")
    assert outcome(node, course("CIS 1068", "C")) is Outcome.SATISFIED
    assert outcome(node, course("CIS 1068", "D")) is Outcome.NOT_SATISFIED
    assert outcome(node) is Outcome.NOT_SATISFIED
    # Not knowing the grade is not failing.
    assert outcome(node, course("CIS 1068", None)) is Outcome.UNKNOWN
    assert outcome(node, course("CIS 1068", "P")) is Outcome.UNKNOWN


def test_all_and_any() -> None:
    pair = RequirementNode(
        id="t0", kind="all", children=[leaf("a", "CHEM 1031"), leaf("b", "CHEM 1033")]
    )
    either = RequirementNode(
        id="t0", kind="any", children=[leaf("a", "CIS 1068"), leaf("b", "CIS 1968")]
    )
    assert outcome(pair, course("CHEM 1031")) is Outcome.NOT_SATISFIED
    assert outcome(pair, course("CHEM 1031"), course("CHEM 1033")) is Outcome.SATISFIED
    assert outcome(either, course("CIS 1968")) is Outcome.SATISFIED
    assert outcome(either) is Outcome.NOT_SATISFIED


def test_choose_counts_courses_and_credits() -> None:
    options = [leaf(f"r{i}", f"CIS 33{i}0") for i in range(4)]
    two = RequirementNode(id="t0", kind="choose", min_courses=2, children=options)
    six_credits = RequirementNode(
        id="t0", kind="choose", min_credits=Decimal(6), children=options
    )
    assert outcome(two, course("CIS 3300")) is Outcome.NOT_SATISFIED
    assert outcome(two, course("CIS 3300"), course("CIS 3310")) is Outcome.SATISFIED
    assert (
        outcome(six_credits, course("CIS 3300"), course("CIS 3310"))
        is Outcome.SATISFIED
    )
    assert outcome(six_credits, course("CIS 3300")) is Outcome.NOT_SATISFIED
    unknown_credits = course("CIS 3310", credits=None)
    assert outcome(six_credits, course("CIS 3300"), unknown_credits) is Outcome.UNKNOWN


def test_course_filters() -> None:
    upper_arth = RequirementNode(
        id="t0",
        kind="course_filter",
        min_courses=2,
        course_filter=CourseFilter(
            subjects=["ARTH"], number_min="2000", number_max="4999"
        ),
    )
    assert (
        outcome(upper_arth, course("ARTH 2101"), course("ARTH 1155"))
        is Outcome.NOT_SATISFIED
    )
    assert (
        outcome(upper_arth, course("ARTH 2101"), course("ARTH 3150"))
        is Outcome.SATISFIED
    )
    # A failing grade doesn't count, and doesn't make the answer uncertain.
    with_grade = upper_arth.model_copy(update={"min_grade": "C"})
    failed = course("ARTH 3150", "F")
    assert outcome(with_grade, course("ARTH 2101"), failed) is Outcome.NOT_SATISFIED
    gened = RequirementNode(
        id="t0", kind="course_filter", course_filter=CourseFilter(attributes=["GA"])
    )
    unknown_attributes = CompletedCourse("ARTH 0820", THREE, "A", None)
    assert outcome(gened, unknown_attributes) is Outcome.UNKNOWN


def test_prose_and_milestones_never_count_as_met() -> None:
    text = RequirementNode(
        id="t0.r1", kind="text", source_text="Electives", interpretation="uninterpreted"
    )
    thesis = RequirementNode(id="t0.r2", kind="milestone", milestone="thesis")
    root = RequirementNode(
        id="t0", kind="all", children=[leaf("t0.r0", "CIS 1068"), text]
    )
    assert outcome(root, course("CIS 1068")) is Outcome.UNSUPPORTED
    assert outcome(thesis) is Outcome.REQUIRES_REVIEW


def test_partial_rules_need_review_even_when_met() -> None:
    node = leaf("t0", "FIN 3504", interpretation=Interpretation.PARTIAL)
    assert outcome(node, course("FIN 3504")) is Outcome.REQUIRES_REVIEW


def test_roots_that_arent_requirements_dont_apply() -> None:
    admission = leaf("t0", "BIOL 1111", role="admission")
    requirement = leaf("t1", "CIS 1068")
    result = evaluate_tree(tree(admission, requirement), [course("CIS 1068")])
    assert result.outcome is Outcome.SATISFIED
    assert result.children[0].outcome is Outcome.NOT_APPLICABLE
    only_plan = evaluate_tree(tree(leaf("t0", "CIS 1068", role="academic_plan")), [])
    assert only_plan.outcome is Outcome.UNSUPPORTED


def test_one_course_meeting_two_requirements_needs_review() -> None:
    root = RequirementNode(
        id="t0", kind="all", children=[leaf("a", "CIS 1068"), leaf("b", "CIS 1068")]
    )
    result = evaluate_tree(tree(root), [course("CIS 1068")])
    assert result.outcome is Outcome.REQUIRES_REVIEW
    assert OVERLAP_NOTE in result.children[0].notes


def program(name: str) -> RequirementTree:
    page = ProgramPage.model_validate_json((FIXTURES / f"{name}.json").read_text())
    return interpret_program(page)


def nodes(roots: list[RequirementNode]):
    for node in roots:
        yield node
        yield from nodes(node.children)


def results(result: NodeResult):
    yield result
    for child in result.children:
        yield from results(child)


def outcomes(
    program_tree: RequirementTree, record: list[CompletedCourse]
) -> dict[str, Outcome]:
    return {r.id: r.outcome for r in results(evaluate_tree(program_tree, record))}


PROGRAMS = sorted(path.stem for path in FIXTURES.glob("*.json"))


@pytest.mark.parametrize("name", PROGRAMS)
def test_real_programs_hold_the_evaluator_invariants(name: str) -> None:
    program_tree = program(name)
    all_nodes = list(nodes(program_tree.roots))
    by_id = {node.id: node for node in all_nodes}
    codes = sorted({node.course for node in all_nodes if node.course})
    rng = random.Random(f"{SEED}:{name}")
    for _ in range(RANDOM_RECORDS):
        taken = rng.sample(codes, rng.randint(0, len(codes)))
        smaller = [course(code) for code in taken[: len(taken) // 2]]
        larger = [course(code) for code in taken]
        before = outcomes(program_tree, smaller)
        after = outcomes(program_tree, larger)
        for node_id, result in after.items():
            node = by_id.get(node_id)
            if node is not None and result is Outcome.SATISFIED:
                # Nothing short of fully interpreted is reported as met.
                assert node.interpretation is Interpretation.INTERPRETED, node_id
            if node is not None and node.kind == "text":
                assert result in {Outcome.UNSUPPORTED, Outcome.NOT_APPLICABLE}
            if before.get(node_id) is Outcome.SATISFIED:
                # More courses never turn a met requirement into a failure.
                assert result is not Outcome.NOT_SATISFIED, node_id
        unknown_grades = [course(code, grade=None) for code in taken]
        for node_id, result in outcomes(program_tree, unknown_grades).items():
            node = by_id.get(node_id)
            if node is not None and node.kind == "course" and node.course in taken:
                # Missing grades are never treated as failing.
                assert result is not Outcome.NOT_SATISFIED or node.min_grade is None, (
                    node_id
                )
