from __future__ import annotations

import uuid

from app.shared.schemas import BaseSchema


class UserResponse(BaseSchema):
    id: uuid.UUID
    email: str
    name: str
    picture_url: str
