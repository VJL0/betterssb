from __future__ import annotations

import re

from app.domains.transcript.schemas import TranscriptCourse, TranscriptData

COURSE_PATTERN = re.compile(
    r"(?P<subject>[A-Z]{2,5})\s+"
    r"(?P<number>\d{3,5}[A-Z]?)\s+"
    r"(?P<title>.+?)\s{2,}"
    r"(?P<grade>[A-F][+-]?|W|WF|P|NP|I|AU|S|U)\s+"
    r"(?P<credits>\d+(?:\.\d+)?)\s+"
    r"(?P<term>.+?)$",
    re.MULTILINE,
)

GPA_PATTERN = re.compile(
    r"(?:Overall|Cumulative|Total)\s+GPA[:\s]+(\d\.\d{1,2})",
    re.IGNORECASE,
)


class TranscriptService:
    """Extract structured course data from pasted transcript text."""

    def parse_transcript(self, text: str) -> TranscriptData:
        """Parse a plain-text transcript into structured course records.

        Recognises lines in the form:
            SUBJ 1234 Course Title    A   3.00   Fall 2024
        """
        courses: list[TranscriptCourse] = []

        for match in COURSE_PATTERN.finditer(text):
            courses.append(
                TranscriptCourse(
                    subject=match.group("subject"),
                    course_number=match.group("number"),
                    title=match.group("title").strip(),
                    grade=match.group("grade"),
                    credits=float(match.group("credits")),
                    term=match.group("term").strip(),
                )
            )

        gpa: float | None = None
        gpa_match = GPA_PATTERN.search(text)
        if gpa_match:
            gpa = float(gpa_match.group(1))

        return TranscriptData(courses=courses, gpa=gpa)

    def check_prerequisites(
        self,
        completed: list[TranscriptCourse],
        required: list[str],
    ) -> dict[str, bool]:
        """Check which prerequisite courses have been completed.

        Args:
            completed: Courses already taken.
            required: Prerequisite identifiers in "SUBJ 1234" format.

        Returns:
            Mapping of each required course to whether it was completed with a
            passing grade.
        """
        passing_grades = {"A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "P", "S"}

        completed_set: set[str] = set()
        for course in completed:
            if course.grade.upper() in passing_grades:
                completed_set.add(f"{course.subject} {course.course_number}")

        return {req: req in completed_set for req in required}
