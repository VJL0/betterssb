from __future__ import annotations

from fastapi import APIRouter

from app.modules.schedule.schemas import GeneratedScheduleList, GenerateRequest
from app.modules.schedule.service import ScheduleService

router = APIRouter(prefix="/schedules", tags=["schedules"])

_service = ScheduleService()


# A custom method (AIP-136): a pure computation, so nothing is created.
@router.post(":generate", response_model=GeneratedScheduleList)
def generate_schedules(body: GenerateRequest) -> GeneratedScheduleList:
    """Generate non-conflicting schedules ranked by preference fit."""
    return GeneratedScheduleList(
        schedules=_service.generate_schedules(
            sections=body.sections,
            preferences=body.preferences,
            max_results=body.max_results,
        )
    )
