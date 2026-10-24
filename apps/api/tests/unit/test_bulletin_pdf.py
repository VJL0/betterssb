from __future__ import annotations

from decimal import Decimal

import pytest

pymupdf = pytest.importorskip("pymupdf", reason="PyMuPDF is in the ingest group")

from app.modules.bulletin.ingest.pdf import read_volume
from app.modules.bulletin.models import RuleNodeType

BODY_SIZE = 8
HEADING_SIZE = 14
LINE_HEIGHT = 12
TOP = 72

# (text, bold, size); a bold label starts a line that continues in regular type.
COURSE_PAGE = [
    ("Computer & Information Science (CIS)", True, HEADING_SIZE),
    ("CIS 3296. Software Design. 4 Credit Hours.", True, BODY_SIZE),
    ("This course provides direct experience in the design of", False, BODY_SIZE),
    ("medium size software projects.", False, BODY_SIZE),
    (("Course Attributes:", " WI"), None, BODY_SIZE),
    (("Pre-requisites:", " Minimum grade of C- in CIS 2168 and"), None, BODY_SIZE),
    ("CIS 3207.", False, BODY_SIZE),
    ("CIS 4398. Projects in Computer Science. 1 to", True, BODY_SIZE),
    ("3 Credit Hours.", True, BODY_SIZE),
    ("Capstone projects.", False, BODY_SIZE),
    ("Mathematics (MATH)", True, HEADING_SIZE),
    ("Text between subjects belongs to no course.", False, BODY_SIZE),
]
POLICY_PAGE = [
    ("Grading", True, HEADING_SIZE),
    ("Letter grades are A through F.", False, BODY_SIZE),
    ("Repeating a Course", True, HEADING_SIZE),
    ("( Policy # 02.10.12 ) Students may repeat a course.", False, BODY_SIZE),
]


def _write_lines(page, lines) -> None:
    for index, (text, bold, size) in enumerate(lines):
        y = TOP + index * LINE_HEIGHT
        if isinstance(text, tuple):
            label, rest = text
            page.insert_text((72, y), label, fontname="hebo", fontsize=size)
            label_width = pymupdf.get_text_length(label, fontname="hebo", fontsize=size)
            page.insert_text(
                (72 + label_width, y), rest, fontname="helv", fontsize=size
            )
        else:
            page.insert_text(
                (72, y), text, fontname="hebo" if bold else "helv", fontsize=size
            )


@pytest.fixture()
def volume(tmp_path):
    document = pymupdf.open()
    for lines in (COURSE_PAGE, POLICY_PAGE):
        _write_lines(document.new_page(), lines)
    document.set_toc(
        [
            [1, "Academic Policies", 2],
            [2, "Grading", 2],
            [2, "Repeating a Course", 2],
            [1, "Course Descriptions (Undergraduate)", 1],
            [2, "Computer & Information Science (CIS)", 1],
            [2, "Mathematics (MATH)", 1],
        ]
    )
    path = tmp_path / "bulletin.pdf"
    document.save(path)
    return read_volume(str(path))


def test_subjects_come_from_the_outline(volume):
    assert volume.subjects == {
        "CIS": "Computer & Information Science",
        "MATH": "Mathematics",
    }


def test_courses_with_wrapped_headings_and_parts(volume):
    software, projects = volume.courses
    assert software.title == "Software Design"
    assert software.description == (
        "This course provides direct experience in the design of medium size software projects."
    )
    assert software.attributes == ["WI"]
    assert (
        software.parts["Pre-requisites"]
        == "Minimum grade of C- in CIS 2168 and CIS 3207."
    )
    assert software.prerequisites.node_type is RuleNodeType.ALL
    assert (projects.credits_min, projects.credits_max) == (Decimal(1), Decimal(3))


def test_a_subject_heading_ends_the_last_course(volume):
    assert volume.courses[-1].description == "Capstone projects."


def test_policies_are_cut_at_the_next_title(volume):
    grading, repeating = volume.policies
    assert grading.body_text == "Grading Letter grades are A through F."
    assert repeating.body_text.startswith("Repeating a Course ( Policy # 02.10.12 )")
