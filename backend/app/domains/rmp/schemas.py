from __future__ import annotations

from pydantic import BaseModel


class RMPRating(BaseModel):
    professor_name: str
    department: str = ""
    overall_rating: float
    would_take_again_pct: float | None = None
    difficulty: float
    num_ratings: int
    top_tags: list[str] = []
    rmp_url: str = ""


class RMPSchool(BaseModel):
    id: str
    legacy_id: int
    name: str
