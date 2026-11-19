from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.http_cache import cached_publicly
from app.modules.rmp.client import RMPUnavailable
from app.modules.rmp.schemas import ProfessorList
from app.modules.rmp.service import RMPRosterService

router = APIRouter(prefix="/professors", tags=["professors"])

UNAVAILABLE = "Rate My Professors ratings aren't loaded yet. Try again in a minute."
# The roster's first sync takes about a minute; asking this often catches its end.
RETRY_AFTER_SECONDS = 10
# The roster is re-synced once it's a day old.
PROFESSORS_CACHE_SECONDS = 60 * 60


def get_rmp_roster(request: Request) -> RMPRosterService | None:
    # Unset when the app runs without its lifespan (tests).
    return getattr(request.app.state, "rmp_roster", None)


RosterDep = Annotated[RMPRosterService | None, Depends(get_rmp_roster)]


@router.get(
    "", response_model=ProfessorList, **cached_publicly(PROFESSORS_CACHE_SECONDS)
)
async def search_professors(name: str, roster: RosterDep) -> ProfessorList:
    """Temple University professors on RateMyProfessors who could be `name`.

    Matches are loose ("Chris" finds "Christopher"); pick the exact profile on
    the client.
    """
    try:
        if roster is None:
            raise RMPUnavailable
        return ProfessorList(professors=await roster.search(name))
    except RMPUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail=UNAVAILABLE,
            headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
        ) from exc
