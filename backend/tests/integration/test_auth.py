"""Google sign-in and sessions, end to end.

Authlib runs for real. Only Google is faked: discovery, keys, and the token endpoint.
"""

from __future__ import annotations

import base64
import json
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient, Response
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_token
from app.domains.auth.models import User, UserSession
from app.integrations.google.client import HANDSHAKE_TTL_SECONDS, GoogleOAuthClient
from app.main import app

settings = app.state.settings

SESSION_COOKIE = "__Host-sid"
STATE_COOKIE = "__Host-oauth_state"


class FakeCache:
    """In-memory stand-in for Redis."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str) -> str | None:
        return self.data.get(key)

    async def set(self, key: str, value: str, expires_in: int | None = None) -> None:
        self.data[key] = value
        self.ttls[key] = expires_in

    async def delete(self, key: str) -> None:
        self.data.pop(key, None)


class FakeGoogle:
    """Fake Google endpoints that issue ID tokens signed with a test key."""

    def __init__(self, google: GoogleOAuthClient) -> None:
        self.key = RSAKey.generate_key(2048, parameters={"kid": "test-key"})
        self.nonce: str | None = None
        self.id_token_overrides: dict = {}
        self.token_requests: list[dict] = []
        # Replace Authlib's network calls.
        google._app.load_server_metadata = self._load_server_metadata
        google._app.fetch_access_token = self._fetch_access_token

    async def _load_server_metadata(self) -> dict:
        return {
            "issuer": "https://accounts.google.com",
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "jwks": KeySet([self.key]).as_dict(private=False),
            "id_token_signing_alg_values_supported": ["RS256"],
        }

    async def _fetch_access_token(self, **params) -> dict:
        self.token_requests.append(params)
        now = int(time.time())
        claims = {
            "iss": "https://accounts.google.com",
            "aud": settings.GOOGLE_CLIENT_ID,
            "sub": "google-sub-123",
            "email": "student@temple.edu",
            "email_verified": True,
            "name": "Test Student",
            "picture": "https://example.com/p.png",
            "iat": now,
            "exp": now + 3600,
            "nonce": self.nonce,
        } | self.id_token_overrides
        id_token = jwt.encode({"alg": "RS256", "kid": "test-key"}, claims, self.key)
        return {"access_token": "ya29.test", "token_type": "Bearer", "expires_in": 3599, "id_token": id_token}


@pytest.fixture()
async def db(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(app.state, "session_factory", factory, raising=False)
    yield factory
    await engine.dispose()


@pytest.fixture()
def cache() -> FakeCache:
    return FakeCache()


@pytest.fixture()
def google(cache: FakeCache, monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    client = GoogleOAuthClient(settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, cache=cache)
    monkeypatch.setattr(app.state, "google", client, raising=False)
    return FakeGoogle(client)


async def start_login(client: AsyncClient, google: FakeGoogle) -> dict[str, str]:
    """Start sign-in and return the query params of Google's authorization URL."""
    resp = await client.get("/api/v1/auth/google/login")
    assert resp.status_code == 302
    params = {k: v[0] for k, v in parse_qs(urlparse(resp.headers["location"]).query).items()}
    google.nonce = params["nonce"]
    return params


async def sign_in(client: AsyncClient, google: FakeGoogle) -> Response:
    params = await start_login(client, google)
    return await client.get("/api/v1/auth/google/callback", params={"code": "auth-code", "state": params["state"]})


def set_cookie_header(resp: Response, name: str) -> str:
    return next(h for h in resp.headers.get_list("set-cookie") if h.startswith(f"{name}="))


class TestLogin:
    async def test_redirects_to_google_with_pkce_state_and_nonce(self, client: AsyncClient, google, cache):
        resp = await client.get("/api/v1/auth/google/login")

        assert resp.status_code == 302
        url = urlparse(resp.headers["location"])
        assert (url.scheme, url.netloc) == ("https", "accounts.google.com")
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        assert params["client_id"] == settings.GOOGLE_CLIENT_ID
        assert params["redirect_uri"] == settings.GOOGLE_REDIRECT_URI
        assert params["response_type"] == "code"
        assert params["scope"] == "openid email profile"
        assert params["code_challenge_method"] == "S256"
        assert params["prompt"] == "select_account"
        assert params["code_challenge"] and params["state"] and params["nonce"]

    async def test_handshake_data_stays_server_side(self, client: AsyncClient, google, cache):
        params = await start_login(client, google)

        # State, nonce, and PKCE verifier live in the cache...
        [stored] = cache.data.values()
        data = json.loads(stored)["data"]
        assert data["nonce"] == params["nonce"]
        assert data["code_verifier"]
        assert list(cache.ttls.values()) == [HANDSHAKE_TTL_SECONDS]

        # ...while the signed cookie only carries a marker for this state.
        payload = client.cookies[STATE_COOKIE].split(".")[0]
        decoded = base64.b64decode(payload + "=" * (-len(payload) % 4)).decode()
        assert params["state"] in decoded
        assert params["nonce"] not in decoded
        assert data["code_verifier"] not in decoded


class TestCallback:
    async def test_sign_in_opens_a_session(self, client: AsyncClient, db, google, cache):
        resp = await sign_in(client, google)

        assert resp.status_code == 303
        assert resp.headers["location"] == settings.FRONTEND_URL

        cookie = set_cookie_header(resp, SESSION_COOKIE).lower()
        for attr in ("httponly", "secure", "samesite=lax", "path=/"):
            assert attr in cookie
        assert "domain=" not in cookie

        # The code exchange used PKCE and the registered redirect URI.
        [token_request] = google.token_requests
        assert token_request["code"] == "auth-code"
        assert token_request["code_verifier"]
        assert token_request["redirect_uri"] == settings.GOOGLE_REDIRECT_URI

        # One-time handshake data is gone.
        assert cache.data == {}

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.headers["cache-control"] == "no-store"
        user = me.json()
        del user["id"]
        assert user == {
            "email": "student@temple.edu",
            "name": "Test Student",
            "pictureUrl": "https://example.com/p.png",
        }

    async def test_only_the_token_hash_is_stored(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        raw = client.cookies[SESSION_COOKIE]

        async with db() as session:
            [stored] = (await session.execute(select(UserSession))).scalars().all()
        assert stored.token_hash == hash_token(raw)
        assert raw not in stored.token_hash

    async def test_users_are_keyed_by_google_sub(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        google.id_token_overrides = {"email": "renamed@gmail.com"}
        client.cookies.clear()
        await sign_in(client, google)

        async with db() as session:
            [user] = (await session.execute(select(User))).scalars().all()
        assert user.google_sub == "google-sub-123"
        assert user.email == "renamed@gmail.com"

    async def test_accepts_issuer_without_scheme(self, client: AsyncClient, db, google):
        google.id_token_overrides = {"iss": "accounts.google.com"}
        resp = await sign_in(client, google)
        assert resp.headers["location"] == settings.FRONTEND_URL

    @pytest.mark.parametrize(
        "overrides",
        [
            {"aud": "someone-elses-client-id"},
            {"iss": "https://evil.example.com"},
            {"nonce": "replayed-nonce"},
            {"exp": int(time.time()) - 3600},
        ],
        ids=["wrong-audience", "wrong-issuer", "wrong-nonce", "expired"],
    )
    async def test_rejects_invalid_id_token(self, client: AsyncClient, db, google, overrides):
        google.id_token_overrides = overrides
        resp = await sign_in(client, google)

        assert resp.status_code == 303
        assert resp.headers["location"].endswith("?auth_error=failed")
        assert SESSION_COOKIE not in client.cookies

    async def test_rejects_unknown_state(self, client: AsyncClient, db, google):
        await start_login(client, google)
        resp = await client.get("/api/v1/auth/google/callback", params={"code": "c", "state": "forged"})

        assert resp.headers["location"].endswith("?auth_error=failed")
        assert google.token_requests == []

    async def test_rejects_callback_from_another_browser(self, client: AsyncClient, db, google):
        """Login CSRF: a valid state is useless without the cookie of the browser that started the flow."""
        params = await start_login(client, google)
        client.cookies.clear()
        resp = await client.get("/api/v1/auth/google/callback", params={"code": "c", "state": params["state"]})

        assert resp.headers["location"].endswith("?auth_error=failed")
        assert google.token_requests == []

    async def test_user_cancelled(self, client: AsyncClient, db, google):
        params = await start_login(client, google)
        resp = await client.get(
            "/api/v1/auth/google/callback", params={"error": "access_denied", "state": params["state"]}
        )
        assert resp.headers["location"].endswith("?auth_error=access_denied")

    async def test_inactive_user_gets_no_session(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        async with db() as session:
            await session.execute(update(User).values(is_active=False))
            await session.commit()
        client.cookies.clear()

        resp = await sign_in(client, google)
        assert resp.headers["location"].endswith("?auth_error=account_disabled")
        assert SESSION_COOKIE not in client.cookies

    async def test_sign_in_rotates_the_session(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        first = client.cookies[SESSION_COOKIE]
        await sign_in(client, google)
        second = client.cookies[SESSION_COOKIE]

        assert first != second
        async with db() as session:
            hashes = (await session.execute(select(UserSession.token_hash))).scalars().all()
        assert hashes == [hash_token(second)]


class TestSession:
    async def test_me_requires_a_session(self, client: AsyncClient, db):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_unknown_token_is_rejected(self, client: AsyncClient, db):
        client.cookies.set(SESSION_COOKIE, "not-a-real-session")
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_logout_ends_the_session_server_side(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        token = client.cookies[SESSION_COOKIE]

        resp = await client.post("/api/v1/auth/logout")
        assert resp.status_code == 204
        assert "max-age=0" in set_cookie_header(resp, SESSION_COOKIE).lower()

        # Replaying the old cookie no longer works.
        client.cookies.set(SESSION_COOKIE, token)
        assert (await client.get("/api/v1/auth/me")).status_code == 401

    async def test_idle_timeout(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        idle = timedelta(days=settings.SESSION_IDLE_TIMEOUT_DAYS)
        async with db() as session:
            await session.execute(
                update(UserSession).values(last_seen_at=datetime.now(UTC) - idle - timedelta(minutes=1))
            )
            await session.commit()

        assert (await client.get("/api/v1/auth/me")).status_code == 401

    async def test_absolute_timeout(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        async with db() as session:
            await session.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
            await session.commit()

        assert (await client.get("/api/v1/auth/me")).status_code == 401

    async def test_activity_extends_the_idle_window(self, client: AsyncClient, db, google):
        await sign_in(client, google)
        an_hour_ago = datetime.now(UTC) - timedelta(hours=1)
        async with db() as session:
            await session.execute(update(UserSession).values(last_seen_at=an_hour_ago))
            await session.commit()

        assert (await client.get("/api/v1/auth/me")).status_code == 200

        async with db() as session:
            last_seen = (await session.execute(select(UserSession.last_seen_at))).scalar_one()
        assert last_seen.replace(tzinfo=UTC) > an_hour_ago + timedelta(minutes=59)
