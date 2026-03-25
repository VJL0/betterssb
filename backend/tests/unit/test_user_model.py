from __future__ import annotations

from app.core.database import Base
from app.models.user import RefreshToken, User


class TestUserTable:
    def test_table_name(self):
        assert User.__tablename__ == "users"

    def test_columns_exist(self):
        cols = {c.name for c in User.__table__.columns}
        expected = {
            "id",
            "email",
            "name",
            "picture_url",
            "google_sub",
            "is_active",
            "created_at",
            "updated_at",
            "last_login_at",
        }
        assert expected <= cols

    def test_email_unique(self):
        email_col = User.__table__.c.email
        assert email_col.unique is True

    def test_google_sub_unique(self):
        col = User.__table__.c.google_sub
        assert col.unique is True


class TestRefreshTokenTable:
    def test_table_name(self):
        assert RefreshToken.__tablename__ == "refresh_tokens"

    def test_columns_exist(self):
        cols = {c.name for c in RefreshToken.__table__.columns}
        expected = {
            "id",
            "user_id",
            "token_hash",
            "expires_at",
            "revoked",
            "device_info",
            "ip_address",
            "created_at",
        }
        assert expected <= cols

    def test_token_hash_unique(self):
        col = RefreshToken.__table__.c.token_hash
        assert col.unique is True


class TestBaseMetadata:
    def test_models_registered(self):
        tables = set(Base.metadata.tables.keys())
        assert "users" in tables
        assert "refresh_tokens" in tables
