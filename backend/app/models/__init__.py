from __future__ import annotations

from app.models.course import Course, Professor, Section
from app.models.degree import (
    CourseOption,
    CourseRef,
    DegreeProgram,
    LabScienceSequence,
    PlanCourse,
    PlanSemester,
    PlanYear,
    RequirementCategory,
    RequirementGroup,
    RequirementItem,
    SelectionType,
    SuggestedPlan,
)
from app.models.professor import RMPRating
from app.models.schedule import GeneratedSchedule, SchedulePreferences
from app.models.transcript import DegreeRequirement, TranscriptCourse, TranscriptData
from app.models.user import RefreshToken, User

__all__ = [
    "Course",
    "CourseOption",
    "CourseRef",
    "DegreeProgram",
    "DegreeRequirement",
    "GeneratedSchedule",
    "LabScienceSequence",
    "PlanCourse",
    "PlanSemester",
    "PlanYear",
    "Professor",
    "RMPRating",
    "RefreshToken",
    "RequirementCategory",
    "RequirementGroup",
    "RequirementItem",
    "SchedulePreferences",
    "Section",
    "SelectionType",
    "SuggestedPlan",
    "TranscriptCourse",
    "TranscriptData",
    "User",
]
