"""Seat watches: students pick CRNs, a scheduled run checks Banner's seats and
emails them when a full section opens.

A run emails only on the change from full (zero or fewer seats) to open, so a
section that stays open sends one email, and one that fills and reopens sends
another. Counts are saved only after the email goes out, so a failed send is
retried on the next run instead of being lost.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.modules.auth.models import User
from app.modules.seat_tracker.client import (
    BannerSectionClient,
    Enrollment,
    SectionUnavailable,
)
from app.modules.seat_tracker.mailer import Email, Mailer, MailError
from app.modules.seat_tracker.models import SeatWatch
from app.modules.seat_tracker.schemas import SeatCheckSummary

logger = logging.getLogger(__name__)

MAX_WATCHES_PER_USER = 10
BANNER_REGISTRATION_URL = (
    "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/registration"
)


class WatchLimitReached(Exception):
    pass


class AlreadyWatching(Exception):
    pass


async def list_watches(db: AsyncSession, user: User) -> list[SeatWatch]:
    watches = await db.scalars(
        select(SeatWatch)
        .where(SeatWatch.user_id == user.id)
        .order_by(SeatWatch.created_at)
    )
    return list(watches)


async def add_watch(
    db: AsyncSession,
    user: User,
    *,
    term: str,
    crn: str,
    banner: BannerSectionClient,
) -> SeatWatch:
    """Look the section up in Banner and start watching it.

    Raises:
        WatchLimitReached: The student already watches the most allowed.
        AlreadyWatching: This CRN is already watched for the term.
        SectionNotFound: Banner has no such CRN in the term.
        SectionUnavailable: Banner didn't answer.
    """
    count = await db.scalar(select(func.count()).where(SeatWatch.user_id == user.id))
    if (count or 0) >= MAX_WATCHES_PER_USER:
        raise WatchLimitReached
    details, enrollment = await asyncio.gather(
        banner.details(term, crn), banner.enrollment(term, crn)
    )
    watch = SeatWatch(
        user_id=user.id,
        term=term,
        crn=crn,
        title=details.title,
        subject=details.subject,
        course_number=details.course_number,
        section=details.section,
    )
    _record(watch, enrollment, datetime.now(UTC))
    db.add(watch)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AlreadyWatching from exc
    # Loads created_at, which the database sets.
    await db.refresh(watch)
    return watch


async def remove_watch(db: AsyncSession, user: User, watch_id: uuid.UUID) -> bool:
    result = await db.execute(
        delete(SeatWatch).where(SeatWatch.id == watch_id, SeatWatch.user_id == user.id)
    )
    await db.commit()
    return result.rowcount > 0


async def check_watches(
    db: AsyncSession,
    *,
    banner: BannerSectionClient,
    mailer: Mailer,
    frontend_url: str,
) -> SeatCheckSummary:
    """Read each watched section's seats once and email whoever it opened for."""
    watches = list(
        await db.scalars(
            select(SeatWatch)
            .join(SeatWatch.user)
            .where(User.is_active.is_(True))
            .options(contains_eager(SeatWatch.user))
        )
    )
    sections = sorted({(watch.term, watch.crn) for watch in watches})
    readings = dict(
        zip(
            sections,
            await asyncio.gather(
                *(_read_enrollment(banner, term, crn) for term, crn in sections)
            ),
            strict=True,
        )
    )

    now = datetime.now(UTC)
    emailed = 0
    for watch in watches:
        enrollment = readings[(watch.term, watch.crn)]
        if enrollment is None:
            continue
        if enrollment.is_open and watch.seats_available <= 0:
            try:
                await mailer.send(
                    opening_email(watch, enrollment, frontend_url=frontend_url)
                )
            except MailError as exc:
                logger.warning("Seat email for watch %s failed: %s", watch.id, exc)
                continue
            watch.notified_at = now
            emailed += 1
        _record(watch, enrollment, now)
    await db.commit()

    return SeatCheckSummary(
        sections=len(sections),
        failed=sum(reading is None for reading in readings.values()),
        emailed=emailed,
    )


def opening_email(
    watch: SeatWatch, enrollment: Enrollment, *, frontend_url: str
) -> Email:
    seats = (
        "1 seat is"
        if enrollment.seats_available == 1
        else f"{enrollment.seats_available} seats are"
    )
    return Email(
        to=watch.user.email,
        subject=f"Seat open: {watch.title} (CRN {watch.crn})",
        text=f"{seats} open in {watch.title}, "
        f"{watch.subject} {watch.course_number}-{watch.section} (CRN {watch.crn}).\n\n"
        f"Register in Banner before it fills: {BANNER_REGISTRATION_URL}\n\n"
        "Registration can still fail on prerequisites, holds or reserved seats.\n\n"
        f"Manage your seat tracker: {frontend_url}\n",
    )


async def _read_enrollment(
    banner: BannerSectionClient, term: str, crn: str
) -> Enrollment | None:
    """None when Banner fails, which leaves the watch's last counts in place."""
    try:
        return await banner.enrollment(term, crn)
    except SectionUnavailable:
        return None


def _record(watch: SeatWatch, enrollment: Enrollment, checked_at: datetime) -> None:
    watch.seats_available = enrollment.seats_available
    watch.maximum_enrollment = enrollment.maximum_enrollment
    watch.wait_count = enrollment.wait_count
    watch.wait_capacity = enrollment.wait_capacity
    watch.wait_available = enrollment.wait_available
    watch.checked_at = checked_at
