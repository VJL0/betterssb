from __future__ import annotations

from app.core.database import Base
from app.domains.auth.models import User, UserSession


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


class TestUserSessionTable:
    def test_table_name(self):
        assert UserSession.__tablename__ == "sessions"

    def test_columns_exist(self):
        cols = {c.name for c in UserSession.__table__.columns}
        expected = {
            "id",
            "user_id",
            "token_hash",
            "created_at",
            "last_seen_at",
            "expires_at",
            "user_agent",
            "ip_address",
        }
        assert expected <= cols

    def test_token_hash_unique(self):
        col = UserSession.__table__.c.token_hash
        assert col.unique is True


class TestBaseMetadata:
    def test_models_registered(self):
        tables = set(Base.metadata.tables.keys())
        assert "users" in tables
        assert "sessions" in tables
