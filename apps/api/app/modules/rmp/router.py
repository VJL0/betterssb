from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.modules.rmp.client import RMPUnavailable
from app.modules.rmp.schemas import RMPRating
from app.modules.rmp.service import RMPRosterService

router = APIRouter(prefix="/rmp", tags=["rmp"])

UNAVAILABLE = "Rate My Professors ratings aren't loaded yet. Try again in a minute."


def get_rmp_roster(request: Request) -> RMPRosterService | None:
    # Unset when the app runs without its lifespan (tests).
    return getattr(request.app.state, "rmp_roster", None)


RosterDep = Annotated[RMPRosterService | None, Depends(get_rmp_roster)]


@router.get("/search", response_model=list[RMPRating])
async def search_professors(name: str, roster: RosterDep) -> list[RMPRating]:
    """Temple University professors on RateMyProfessors who could be `name`.

    Matches are loose ("Chris" finds "Christopher"); pick the exact profile on
    the client.
    """
    try:
        if roster is None:
            raise RMPUnavailable
        return await roster.search(name)
    except RMPUnavailable as exc:
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc
