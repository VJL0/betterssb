from __future__ import annotations

import uuid

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_token,
)


def _test_settings() -> Settings:
    return Settings(
        JWT_SECRET="test-secret-key-for-unit-tests-minimum-32-bytes-long",
        JWT_ALGORITHM="HS256",
        ACCESS_TOKEN_EXPIRE_MINUTES=15,
        DATABASE_URL="sqlite+aiosqlite:///",
    )


class TestAccessToken:
    def test_roundtrip(self):
        settings = _test_settings()
        uid = uuid.uuid4()
        token = create_access_token(uid, settings)
        payload = decode_access_token(token, settings)
        assert payload["sub"] == str(uid)
        assert payload["type"] == "access"

    def test_contains_expiration(self):
        settings = _test_settings()
        token = create_access_token(uuid.uuid4(), settings)
        payload = decode_access_token(token, settings)
        assert "exp" in payload

    def test_wrong_secret_fails(self):
        import jwt

        settings = _test_settings()
        token = create_access_token(uuid.uuid4(), settings)
        bad_settings = Settings(
            JWT_SECRET="wrong-secret-but-still-at-least-32-bytes-ok",
            DATABASE_URL="sqlite+aiosqlite:///",
        )
        import pytest

        with pytest.raises(jwt.InvalidSignatureError):
            decode_access_token(token, bad_settings)


class TestRefreshToken:
    def test_generate_returns_pair(self):
        raw, hashed = generate_refresh_token()
        assert len(raw) > 20
        assert len(hashed) == 64  # SHA-256 hex

    def test_hash_is_deterministic(self):
        raw, hashed = generate_refresh_token()
        assert hash_token(raw) == hashed

    def test_each_call_is_unique(self):
        tokens = {generate_refresh_token()[0] for _ in range(50)}
        assert len(tokens) == 50
