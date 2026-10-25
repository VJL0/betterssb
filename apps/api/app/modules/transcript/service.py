from __future__ import annotations

from app.modules.transcript.schemas import TranscriptCourse


class TranscriptService:
    """Check transcript courses against prerequisites."""

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
        passing_grades = {
            "A+",
            "A",
            "A-",
            "B+",
            "B",
            "B-",
            "C+",
            "C",
            "C-",
            "D+",
            "D",
            "D-",
            "P",
            "S",
        }

        completed_set: set[str] = set()
        for course in completed:
            if course.grade.upper() in passing_grades:
                completed_set.add(f"{course.subject} {course.course_number}")

        return {req: req in completed_set for req in required}
