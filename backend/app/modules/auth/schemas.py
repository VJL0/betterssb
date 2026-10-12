from __future__ import annotations

from app.shared.schemas.base import BaseSchema


class UserResponse(BaseSchema):
    id: str
    email: str
    name: str
    picture_url: str
