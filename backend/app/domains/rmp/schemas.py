from __future__ import annotations

from app.shared.schemas.base import BaseSchema


class RMPRating(BaseSchema):
    professor_name: str
    department: str = ""
    overall_rating: float
    would_take_again_pct: float | None = None
    difficulty: float
    num_ratings: int
    top_tags: list[str] = []
    rmp_url: str = ""


class RMPSchool(BaseSchema):
    id: str
    legacy_id: int
    name: str
