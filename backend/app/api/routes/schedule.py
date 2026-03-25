from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.course import Section
from app.models.schedule import GeneratedSchedule, SchedulePreferences
from app.services.schedule_service import ScheduleService

router = APIRouter(prefix="/schedule", tags=["schedule"])

_service = ScheduleService()


class GenerateRequest(BaseModel):
    sections: list[Section]
    preferences: SchedulePreferences = SchedulePreferences()
    max_results: int = 5


@router.post("/generate", response_model=list[GeneratedSchedule])
def generate_schedules(body: GenerateRequest) -> list[GeneratedSchedule]:
    """Generate non-conflicting schedules ranked by preference fit."""
    return _service.generate_schedules(
        sections=body.sections,
        preferences=body.preferences,
        max_results=body.max_results,
    )
