from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.modules.bulletin.ingest.load import walk_nodes
from app.modules.bulletin.ingest.report import REASON_PATH
from app.modules.bulletin.rules import (
    RequirementNode,
    RequisiteExpression,
    expand_course_code,
)


@pytest.mark.parametrize(
    ("printed", "codes"),
    [
        ("CIS 1068", ["CIS 1068"]),
        ("GUS/ENST 3061", ["GUS 3061", "ENST 3061"]),
        ("ECON 3507/3597", ["ECON 3507", "ECON 3597"]),
        ("BA 9212/FIN 9004", ["BA 9212", "FIN 9004"]),
        (
            "BIOL/CHEM/EES/PHYS 3091",
            ["BIOL 3091", "CHEM 3091", "EES 3091", "PHYS 3091"],
        ),
        ("MATH 1041 ", ["MATH 1041"]),
    ],
)
def test_cross_listed_codes_expand(printed: str, codes: list[str]) -> None:
    assert expand_course_code(printed) == codes


@pytest.mark.parametrize(
    "printed", ["", "CIS", "CIS 1068/", "Free Elective", "GenEd 08xx", "cis 1068"]
)
def test_non_codes_expand_to_nothing(printed: str) -> None:
    assert expand_course_code(printed) == []


def test_rules_store_snake_case_and_serve_camel_case() -> None:
    expression = RequisiteExpression(
        kind="course", course="CIS 1068", min_grade="C-", min_credits=Decimal(3)
    )
    stored = json.loads(expression.model_dump_json(exclude_defaults=True))
    served = expression.model_dump(mode="json", by_alias=True, exclude_defaults=True)
    assert stored == {
        "kind": "course",
        "course": "CIS 1068",
        "min_grade": "C-",
        "min_credits": "3",
    }
    assert served["minGrade"] == "C-"
    assert RequisiteExpression.model_validate(stored) == expression
    assert RequisiteExpression.model_validate(served) == expression


def test_walk_nodes_gives_parents_and_positions() -> None:
    tree = RequirementNode(
        id="t0",
        kind="all",
        children=[
            RequirementNode(id="t0.r0", kind="course", course="CIS 1068"),
            RequirementNode(
                id="t0.r1",
                kind="any",
                children=[
                    RequirementNode(id="t0.r1.r2", kind="course", course="CIS 2168")
                ],
            ),
        ],
    )
    assert [(n.id, parent, position) for n, parent, position in walk_nodes([tree])] == [
        ("t0", None, 0),
        ("t0.r0", "t0", 0),
        ("t0.r1", "t0", 1),
        ("t0.r1.r2", "t0.r1", 0),
    ]


def test_excluded_reasons_group_by_pattern() -> None:
    reason = "course search result; its content is on /courses/aaas/; robots.txt disallows /search/"
    assert REASON_PATH.sub("<path>", reason) == (
        "course search result; its content is on <path>; robots.txt disallows <path>"
    )
