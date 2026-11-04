from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.auth.models import User


class SeatWatch(Base):
    """A section a signed-in student wants an email about when a seat opens.

    The seat counts are Banner's from the last successful check, so a run can
    tell a section that just opened from one that was already open.
    """

    __tablename__ = "seat_watches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    term: Mapped[str] = mapped_column(String(6), nullable=False)
    crn: Mapped[str] = mapped_column(String(5), nullable=False)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    course_number: Mapped[str] = mapped_column(String(10), nullable=False)
    section: Mapped[str] = mapped_column(String(10), nullable=False)

    seats_available: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Banner's count; zero or negative is full",
    )
    maximum_enrollment: Mapped[int] = mapped_column(Integer, nullable=False)
    wait_count: Mapped[int] = mapped_column(Integer, nullable=False)
    wait_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    wait_available: Mapped[int] = mapped_column(Integer, nullable=False)

    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last opening email sent",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[User] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "user_id", "term", "crn", name="uq_seat_watches_user_term_crn"
        ),
        Index("ix_seat_watches_term_crn", "term", "crn"),
    )
