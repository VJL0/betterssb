from __future__ import annotations

from pydantic import Field

from app.shared.schemas import BaseSchema


class RMPRating(BaseSchema):
    professor_name: str
    department: str = ""
    overall_rating: float
    would_take_again_pct: float | None = None
    difficulty: float
    num_ratings: int
    top_tags: list[str] = Field(default_factory=list)
    rmp_url: str = ""


class RMPSchool(BaseSchema):
    id: str
    legacy_id: int
    name: str
