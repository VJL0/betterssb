from __future__ import annotations

from fastapi import APIRouter

from app.modules.schedule.schemas import GeneratedSchedule, GenerateRequest
from app.modules.schedule.service import ScheduleService

router = APIRouter(prefix="/schedule", tags=["schedule"])

_service = ScheduleService()


@router.post("/generate", response_model=list[GeneratedSchedule])
def generate_schedules(body: GenerateRequest) -> list[GeneratedSchedule]:
    """Generate non-conflicting schedules ranked by preference fit."""
    return _service.generate_schedules(
        sections=body.sections,
        preferences=body.preferences,
        max_results=body.max_results,
    )
