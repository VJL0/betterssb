from __future__ import annotations

import logging
import secrets
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)

from app.api.deps import DbDep, SettingsDep
from app.core.cache import Cache, cache_claim, get_cache
from app.core.errors import upstream_failure_status
from app.modules.auth.dependencies import CurrentUserDep
from app.modules.classes.section_client import (
    BannerSectionClient,
    SectionNotFound,
    SectionUnavailable,
)
from app.modules.seat_tracker import service
from app.modules.seat_tracker.mailer import create_mailer
from app.modules.seat_tracker.schemas import (
    SeatCheckSummary,
    SeatWatchCreate,
    SeatWatchList,
    SeatWatchResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/seat-watches", tags=["seat-tracker"])

UNAVAILABLE = "Banner isn't responding. Try again in a minute."
# Shorter than the one-minute schedule, so a crashed run can't block the next.
CHECK_LOCK_KEY = "seat-tracker:check"
CHECK_LOCK_TTL_SECONDS = 55


def get_banner_client() -> BannerSectionClient:
    return BannerSectionClient()


BannerDep = Annotated[BannerSectionClient, Depends(get_banner_client)]


def _response(watch: object) -> SeatWatchResponse:
    return SeatWatchResponse.model_validate(watch, from_attributes=True)


@router.get("", response_model=SeatWatchList)
async def list_seat_watches(user: CurrentUserDep, db: DbDep) -> SeatWatchList:
    """The signed-in student's watched sections, oldest first."""
    watches = await service.list_watches(db, user)
    return SeatWatchList(seat_watches=[_response(watch) for watch in watches])


@router.post("", response_model=SeatWatchResponse, status_code=status.HTTP_201_CREATED)
async def create_seat_watch(
    body: SeatWatchCreate,
    user: CurrentUserDep,
    db: DbDep,
    banner: BannerDep,
    request: Request,
    response: Response,
) -> SeatWatchResponse:
    """Watch a CRN and email the student's Google address when a seat opens."""
    try:
        watch = await service.add_watch(
            db, user, term=body.term, crn=body.crn, banner=banner
        )
    except service.WatchLimitReached as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You can watch up to {service.MAX_WATCHES_PER_USER} sections.",
        ) from exc
    except service.AlreadyWatching as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You're already watching CRN {body.crn}.",
        ) from exc
    except SectionNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"There's no CRN {body.crn} in this term.",
        ) from exc
    except SectionUnavailable as exc:
        raise HTTPException(
            status_code=upstream_failure_status(exc), detail=UNAVAILABLE
        ) from exc
    # RFC 9110 §15.3.2: where the new watch lives. A relative reference, since the
    # website reaches the API through its own origin.
    response.headers["Location"] = request.app.url_path_for(
        "get_seat_watch", watch_id=str(watch.id)
    )
    return _response(watch)


@router.delete("/{watch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_seat_watch(
    watch_id: uuid.UUID, user: CurrentUserDep, db: DbDep
) -> Response:
    """Stop watching a section."""
    if not await service.remove_watch(db, user, watch_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _require_cron_secret(
    settings: SettingsDep,
    authorization: Annotated[str, Header()] = "",
) -> None:
    if not settings.CRON_SECRET:
        raise HTTPException(status_code=503, detail="Seat checks aren't configured.")
    if not secrets.compare_digest(authorization, f"Bearer {settings.CRON_SECRET}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


# A custom method (AIP-136): it sends email, so it can't be a safe GET (RFC 9110
# §9.2.1). The scheduler calls it, not the website, so it stays out of the client.
@router.post(
    ":check",
    response_model=SeatCheckSummary,
    include_in_schema=False,
    dependencies=[Depends(_require_cron_secret)],
)
async def check_seat_watches(
    db: DbDep,
    settings: SettingsDep,
    banner: BannerDep,
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> SeatCheckSummary:
    """Check every watched section once and email the students it opened for."""
    mailer = create_mailer(settings)
    if mailer is None:
        raise HTTPException(status_code=503, detail="Seat emails aren't configured.")
    if not await cache_claim(cache, CHECK_LOCK_KEY, CHECK_LOCK_TTL_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A check is already running."
        )
    summary = await service.check_watches(
        db, banner=banner, mailer=mailer, frontend_url=settings.FRONTEND_URL
    )
    logger.info("Seat check: %s", summary.model_dump())
    return summary


@router.get("/{watch_id}", response_model=SeatWatchResponse)
async def get_seat_watch(
    watch_id: uuid.UUID, user: CurrentUserDep, db: DbDep
) -> SeatWatchResponse:
    """One of the signed-in student's watched sections."""
    watch = await service.get_watch(db, user, watch_id)
    if watch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _response(watch)
