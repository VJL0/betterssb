"""Prerequisite and corequisite interpretation, on passages from Temple's
2026-2027 Bulletin (course in the comment above each)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.modules.bulletin.ingest.extract.courses import (
    CoursePart,
    CourseRecord,
    CreditHours,
)
from app.modules.bulletin.ingest.interpret.requisites import (
    interpret_requisites,
    parse_requisite_text,
)
from app.modules.bulletin.ingest.records import Evidence, Locator
from app.modules.bulletin.rules import Interpretation, RequisiteExpression


def shape(node: RequisiteExpression) -> str:
    """A compact rendering: `all(CIS 1068, any(...))`, grades as `@C-`,
    concurrency as `~`, bounds as `#2` (courses), `cr9` (credits), `gpa3`."""
    match node.kind:
        case "course":
            text = node.course or ""
        case "test":
            text = f"{node.test}={node.score}"
        case "course_filter":
            courses = node.course_filter
            assert courses is not None
            parts = [
                "/".join(courses.subjects),
                f"{courses.number_min}-{courses.number_max}"
                if courses.number_min
                else "",
                ",".join(courses.attributes),
            ]
            text = f"filter[{' '.join(part for part in parts if part)}]"
        case "condition" | "text":
            inner = ", ".join(shape(child) for child in node.children)
            text = f"{node.kind}<{node.text}>" + (f"({inner})" if inner else "")
        case _:
            text = f"{node.kind}({', '.join(shape(child) for child in node.children)})"
    bounds = "".join(
        f"{mark}{value}"
        for mark, value in (
            ("#", node.min_count),
            ("cr", node.min_credits),
            ("gpa", node.min_gpa),
            ("@", node.min_grade),
        )
        if value is not None
    )
    return f"{text}{bounds}{'~' if node.concurrent else ''}"


def prerequisite(text: str):
    requisite = parse_requisite_text("prerequisite", text)
    assert requisite.expression is not None
    return requisite, shape(requisite.expression)


# CIS 2168
def test_nested_groups_concurrency_tests_and_ranges() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C- in (CIS 1068 or CIS 1968), (CIS 1166, CIS 1966, or "
        "MATH 2111), and (MATH 1022, any MATH course numbered 1038 to 4999 (may be "
        "taken concurrently), 'Y' in MC6, 'Y' in MA04, 'Y' in MC6A, 'Y' in MATW, "
        "or 'Y' in MC6T)"
    )
    assert tree == (
        "all(any(CIS 1068, CIS 1968), any(CIS 1166, CIS 1966, MATH 2111), "
        "any(MATH 1022, filter[MATH 1038-4999]~, MC6=Y, MA04=Y, MC6A=Y, MATW=Y, "
        "MC6T=Y))@C-"
    )
    assert requisite.interpretation is Interpretation.INTERPRETED
    assert requisite.courses == [
        "CIS 1068",
        "CIS 1968",
        "CIS 1166",
        "CIS 1966",
        "MATH 2111",
        "MATH 1022",
    ]


# CIS 3207
def test_comma_list_with_final_and() -> None:
    _, tree = prerequisite("Minimum grade of C- in CIS 1166, CIS 2107, and CIS 2168.")
    assert tree == "all(CIS 1166, CIS 2107, CIS 2168)@C-"


# CIS 4398
def test_group_then_course() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in (CIS 3238, CIS 3287, or CIS 3296) and CIS 3223."
    )
    assert tree == "all(any(CIS 3238, CIS 3287, CIS 3296), CIS 3223)@C-"


# NURS 8102
def test_single_course() -> None:
    requisite, tree = prerequisite("Minimum grade of B- in NURS 8101.")
    assert tree == "NURS 8101@B-"
    assert requisite.interpretation is Interpretation.INTERPRETED


# ANAT M832: professional course numbers start with a letter.
def test_letter_numbered_courses() -> None:
    _, tree = prerequisite(
        "Minimum grade of P in INTM M301, OBGY M320, PEDI M330, PSYM M340, "
        "SURG M350, NEUR M370, and FAMP M360."
    )
    assert tree == (
        "all(INTM M301, OBGY M320, PEDI M330, PSYM M340, SURG M350, NEUR M370, "
        "FAMP M360)@P"
    )


# JUDO 0782: the passage's grade, lowered for one course.
def test_except_where_noted_override() -> None:
    _, tree = prerequisite(
        "Minimum grade of S- (except where noted) in JUDO 0781 and JUDO 5034 "
        "(D or higher)"
    )
    assert tree == "all(JUDO 0781, JUDO 5034@D)@S-"


# MIS 2402
def test_grade_and_concurrency_in_one_note() -> None:
    _, tree = prerequisite(
        "Minimum grade of C (except where noted) in (MIS 1101, MIS 1901, MIS 2101, "
        "MIS 2901, 'Y' in CRMI01, or 'Y' in CRMI04), (MIS 2502 (may be taken "
        "concurrently) or 'Y' in CRMI03), and (MIS 1001 (CR or higher; may be taken "
        "concurrently) or 'Y' in X001)"
    )
    assert tree == (
        "all(any(MIS 1101, MIS 1901, MIS 2101, MIS 2901, CRMI01=Y, CRMI04=Y), "
        "any(MIS 2502~, CRMI03=Y), any(MIS 1001@CR~, X001=Y))@C"
    )


# EDUC 2179
def test_concurrency_on_every_alternative() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in (SCTC 1289 (may be taken concurrently) or "
        "SCTC 1389 (may be taken concurrently))"
    )
    assert tree == "any(SCTC 1289~, SCTC 1389~)@C-"


# BIOL 3324
def test_group_inside_group() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in ((BIOL 2207 and BIOL 2297), BIOL 2296, or "
        "BIOL 2217) and (CHEM 2201, CHEM 2211, or CHEM 2921)"
    )
    assert tree == (
        "all(any(all(BIOL 2207, BIOL 2297), BIOL 2296, BIOL 2217), "
        "any(CHEM 2201, CHEM 2211, CHEM 2921))@C-"
    )


# ECE 1014
def test_attribute_filters() -> None:
    requisite, tree = prerequisite(
        'Minimum grade of C- in (any course with attribute "SA" or any course with '
        'attribute "GS")'
    )
    assert tree == "any(filter[SA], filter[GS])@C-"
    assert requisite.courses == []


# SPAN 1002: placement scores other than 'Y'.
def test_placement_scores() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in (SPAN 1001, SPAN 1901, 'C1002' in LCSP, 'B1002' in "
        "LCSP, 'C1003' in LCSP, 'B1003' in LCSP, or 'EXMPT' in LCSP)"
    )
    assert tree == (
        "any(SPAN 1001, SPAN 1901, LCSP=C1002, LCSP=B1002, LCSP=C1003, "
        "LCSP=B1003, LCSP=EXMPT)@C-"
    )


# NSCI 3602
def test_level_filter() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C- in (PSY 1003, PSY 2168, STAT 2102, or STAT 2103), "
        "(PSY 1004, PSY 1167, SOC 1167, MATH 1013, or STAT 2101), and any "
        "2000-level PSY course."
    )
    assert tree.endswith(", filter[PSY 2000-2999])@C-")
    assert requisite.interpretation is Interpretation.INTERPRETED


# KINS 4282: the head takes the rest of its list.
def test_completed_n_of_the_following_is_choose() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C in (KINS 1201, 'Y' in KIN3, or 'Y' in CRKI01), "
        "(KINS 3296 or 'Y' in CRKI11), and Completed 2 of the following: (KINS 2203 "
        "or 'Y' in CRKI05), (KINS 2204, 'Y' in KIN4, or 'Y' in CRKI06), and "
        "(KINS 3202 or 'Y' in CRKI10)"
    )
    assert tree == (
        "all(any(KINS 1201, KIN3=Y, CRKI01=Y), any(KINS 3296, CRKI11=Y), "
        "choose(any(KINS 2203, CRKI05=Y), any(KINS 2204, KIN4=Y, CRKI06=Y), "
        "any(KINS 3202, CRKI10=Y))#2)@C"
    )
    assert requisite.interpretation is Interpretation.INTERPRETED


# ISE 4176: a head with no parentheses after its colon.
def test_head_without_parentheses() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in ENGR 2196 and Complete 2 of the following: "
        "ISE 3102, ISE 3103, and ISE 4104."
    )
    assert tree == "all(ENGR 2196, choose(ISE 3102, ISE 3103, ISE 4104)#2)@C-"


# HRM 3581
def test_gpa_over_a_course_range() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C- in HRM 2501 and minimum GPA of 2.5 in: courses "
        "numbered 0700 to 4999."
    )
    assert tree == "all(HRM 2501, filter[0700-4999]gpa2.5)@C-"
    assert requisite.interpretation is Interpretation.INTERPRETED


# MUED 4669
def test_gpa_over_listed_courses() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C- in minimum GPA of 3 in: (MUED 2665, MUED 4666, and "
        "MUED 3661)"
    )
    assert tree == "all(MUED 2665, MUED 4666, MUED 3661)gpa3@C-"
    assert requisite.interpretation is Interpretation.INTERPRETED


# ART 4101
def test_credits_in_one_course() -> None:
    requisite, tree = prerequisite("Minimum grade of C- in 6 credits in ART 3101.")
    assert tree == "ART 3101cr6@C-"
    assert requisite.interpretation is Interpretation.INTERPRETED
    assert requisite.courses == ["ART 3101"]


# ADV 4103
def test_course_count_over_a_level() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C in (2 3000-level ADV courses (may be taken "
        "concurrently) or 'Y' in CRAD20)"
    )
    assert tree == "any(filter[ADV 3000-3999]#2~, CRAD20=Y)@C"
    assert requisite.interpretation is Interpretation.INTERPRETED


# ART 4601
def test_credit_totals_over_levels() -> None:
    _, tree = prerequisite(
        "Minimum grade of C- in (9 credits in 3600-level ART courses, 9 credits in "
        "3400-level GAD courses, or 9 credits in 3400-level PHOT courses)"
    )
    assert tree == (
        "any(filter[ART 3600-3699]cr9, filter[GAD 3400-3499]cr9, "
        "filter[PHOT 3400-3499]cr9)@C-"
    )


# PR 2662: the head's operands end at their own final item.
def test_head_scope_ends_at_its_last_item() -> None:
    _, tree = prerequisite(
        "Minimum grade of C (except where noted) in (Complete the following: "
        "(CSI 1111 or 'Y' in CRCO01), (PR 1112 or 'Y' in CRPR02), (PR 1101 or 'Y' in "
        "CRPR01), (PR 1496 or 'Y' in CRPR03), and (PR 1552 or 'Y' in CRPR04) or "
        "CMST 2111 (C- or higher))"
    )
    assert tree == (
        "any(all(any(CSI 1111, CRCO01=Y), any(PR 1112, CRPR02=Y), "
        "any(PR 1101, CRPR01=Y), any(PR 1496, CRPR03=Y), any(PR 1552, CRPR04=Y)), "
        "CMST 2111@C-)@C"
    )


# SSWG 8101: two heads as alternatives in one list.
def test_two_heads_in_one_list() -> None:
    _, tree = prerequisite(
        "Minimum grade of B- (except where noted) in (SSWG 5302, Complete the "
        "following: SSWG 5001, SSWG 5002, (SSWG 5003 or 'Y' in SW03), SSWG 5107, "
        "SSWG 5108, and SSWG 5188 (P or higher), or Complete the following: "
        "(SSWG 5003 or 'Y' in SW03), SSWG 5101, SSWG 5102, SSWG 5103, SSWG 5104, "
        "and SSWG 5188 (P or higher))"
    )
    assert tree == (
        "any(SSWG 5302, all(SSWG 5001, SSWG 5002, any(SSWG 5003, SW03=Y), "
        "SSWG 5107, SSWG 5108, SSWG 5188@P), all(any(SSWG 5003, SW03=Y), "
        "SSWG 5101, SSWG 5102, SSWG 5103, SSWG 5104, SSWG 5188@P))@B-"
    )


# BOT 3101: a course set with no quantity printed.
def test_course_set_without_quantity_is_partial() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of D- in ((BOT 1111 and CHEM courses numbered 1021 to 1024) "
        "or BIOL courses numbered 1011 to 1012)"
    )
    assert tree == (
        "any(all(BOT 1111, condition<CHEM courses numbered 1021 to 1024>), "
        "condition<BIOL courses numbered 1011 to 1012>)@D-"
    )
    assert requisite.interpretation is Interpretation.PARTIAL


# ARTH 3097
def test_credits_needed_head() -> None:
    _, tree = prerequisite(
        "Minimum grade of C (except where noted) in 16 credits needed: "
        "(ARTH 2000 or ARTH U000 (TR or higher))"
    )
    assert tree == "choose(ARTH 2000, ARTH U000@TR)cr16@C"


# ECED 3208: Banner prints no conjunction between corequisites.
def test_corequisites_without_conjunction_are_partial() -> None:
    requisite = parse_requisite_text("corequisite", "ECED 3207, ECED 3296.")
    assert requisite.expression is not None
    assert shape(requisite.expression) == "all(ECED 3207, ECED 3296)"
    assert requisite.interpretation is Interpretation.PARTIAL
    assert requisite.notes == ["list has no printed conjunction; read as all"]


# ARTT 2011: an unknown head keeps its wording over its operands.
def test_unknown_head_is_a_partial_condition() -> None:
    requisite, tree = prerequisite(
        "Minimum grade of C- in (Art requirements: (ARTU 1401 or ART 1503), "
        "(ARTU 1201 or ART 1011), and (ARTU 1501 or ART 1012), (FDPR 1511 and "
        "FDPR 1521), or Select 2 from the following: VS 1151, VS 1351, and VS 1451) "
        "and ARTT 3004."
    )
    assert tree == (
        "all(any(condition<Art requirements:>(any(ARTU 1401, ART 1503), "
        "any(ARTU 1201, ART 1011), any(ARTU 1501, ART 1012)), "
        "all(FDPR 1511, FDPR 1521), choose(VS 1151, VS 1351, VS 1451)#2), "
        "ARTT 3004)@C-"
    )
    assert requisite.interpretation is Interpretation.PARTIAL
    assert requisite.notes == ["condition kept as text: 'Art requirements:'"]


def test_mixed_conjunctions_without_grouping_are_uninterpreted() -> None:
    text = "Minimum grade of C- in CIS 1068, CIS 1968, and CIS 1051 or CIS 1057."
    requisite = parse_requisite_text("prerequisite", text)
    assert requisite.interpretation is Interpretation.UNINTERPRETED
    assert requisite.expression == RequisiteExpression(kind="text", text=text)
    assert requisite.courses == ["CIS 1068", "CIS 1968", "CIS 1051", "CIS 1057"]


# POLS 2341: an older pipe-delimited format.
def test_pipe_format_is_kept_as_text() -> None:
    requisite = parse_requisite_text(
        "prerequisite",
        "POLS 1301|Minimum Grade of C-|May not be taken concurrentlyOR "
        "POLS 1931|Minimum Grade of C-|May not be taken concurrently.",
    )
    assert requisite.interpretation is not Interpretation.INTERPRETED
    assert requisite.courses == ["POLS 1301", "POLS 1931"]


@pytest.mark.parametrize(
    "text",
    [
        "Minimum grade of C- in (CIS 1068 or CIS 1968",
        "Minimum grade of C- in CIS 1068 or CIS 1968)",
        "Minimum grade of C- in CIS 1068 and CIS 1968 or CIS 1051",
        "Minimum grade of C- in (CIS 1068 or)",
        "Minimum grade of C- in",
    ],
)
def test_malformed_passages_are_uninterpreted(text: str) -> None:
    requisite = parse_requisite_text("prerequisite", text)
    assert requisite.interpretation is Interpretation.UNINTERPRETED
    assert requisite.expression is not None
    assert requisite.expression.kind == "text"


def test_prose_is_never_interpreted() -> None:
    requisite, tree = prerequisite("Junior or Senior standing.")
    assert requisite.interpretation is Interpretation.PARTIAL
    assert tree == "any(text<Junior>, text<Senior standing>)"


def _course(*parts: tuple[str, str]) -> CourseRecord:
    evidence = Evidence(
        url="https://bulletin.temple.edu/courses/cis/",
        sha256="0" * 64,
        locator=Locator(xpath="/html/body/div[1]", line=1),
        text="",
    )
    return CourseRecord(
        subject="CIS",
        number="4398",
        title="Projects in Computer Science",
        credits=CreditHours(text="3", minimum=Decimal(3), maximum=Decimal(3)),
        description="",
        parts=[
            CoursePart(label=label, text=text, evidence=evidence)
            for label, text in parts
        ],
        attributes=[],
        referenced_courses=[],
        evidence=evidence,
    )


def test_interpret_requisites_reads_only_requisite_parts() -> None:
    course = _course(
        ("Repeatability", "This course may not be repeated for additional credits."),
        ("Pre-requisites", "Minimum grade of C- in CIS 3223."),
        ("Co-requisites", "CIS 3296."),
    )
    requisites = interpret_requisites(course)
    assert [(r.kind, r.courses) for r in requisites] == [
        ("prerequisite", ["CIS 3223"]),
        ("corequisite", ["CIS 3296"]),
    ]
    assert all(r.interpretation is Interpretation.INTERPRETED for r in requisites)
