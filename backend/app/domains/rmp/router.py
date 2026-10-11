from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import SettingsDep
from app.domains.rmp.schemas import RMPRating, RMPSchool
from app.domains.rmp.service import RMPService

router = APIRouter(prefix="/rmp", tags=["rmp"])


def _rmp_service(settings: SettingsDep) -> RMPService:
    return RMPService(auth_token=settings.RMP_AUTH_TOKEN)


RMPServiceDep = Annotated[RMPService, Depends(_rmp_service)]


@router.get("/schools", response_model=list[RMPSchool])
async def search_schools(query: str, service: RMPServiceDep) -> list[RMPSchool]:
    """Search RateMyProfessors for schools by name."""
    return await service.search_schools(query)


@router.get("/search", response_model=list[RMPRating])
async def search_professors(
    name: str,
    service: RMPServiceDep,
    school: str = "",
    school_id: str = "",
) -> list[RMPRating]:
    """Search RateMyProfessors for a professor by name."""
    return await service.search_professor(name, school_name=school, school_id=school_id)


@router.get("/{rmp_id}", response_model=RMPRating)
async def get_professor(rmp_id: str, service: RMPServiceDep) -> RMPRating:
    """Get a single professor's ratings by their RMP ID."""
    result = await service.get_professor_by_id(rmp_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return result
