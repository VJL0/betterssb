from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings
from app.core.deps import get_settings
from app.models.professor import RMPRating
from app.services.rmp_service import RMPService

router = APIRouter(prefix="/rmp", tags=["rmp"])


def _rmp_service(settings: Settings = Depends(get_settings)) -> RMPService:
    return RMPService(auth_token=settings.RMP_AUTH_TOKEN)


@router.get("/search", response_model=list[RMPRating])
async def search_professors(
    name: str,
    school: str = "",
    school_id: str = "",
    service: RMPService = Depends(_rmp_service),
) -> list[RMPRating]:
    """Search RateMyProfessors for a professor by name."""
    return await service.search_professor(name, school_name=school, school_id=school_id)


@router.get("/{rmp_id}", response_model=RMPRating)
async def get_professor(
    rmp_id: str,
    service: RMPService = Depends(_rmp_service),
) -> RMPRating:
    """Get a single professor's ratings by their RMP ID."""
    result = await service.get_professor_by_id(rmp_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return result
