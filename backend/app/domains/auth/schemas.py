from __future__ import annotations

from app.shared.schemas.base import BaseSchema


class GoogleLoginRequest(BaseSchema):
    credential: str


class RefreshRequest(BaseSchema):
    refresh_token: str


class UserResponse(BaseSchema):
    id: str
    email: str
    name: str
    picture_url: str


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
