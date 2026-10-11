from __future__ import annotations

from app.core.security import cookie_name, generate_session_token, hash_token


class TestSessionToken:
    def test_generate_returns_pair(self):
        raw, hashed = generate_session_token()
        assert len(raw) >= 43  # 32 bytes, base64url
        assert len(hashed) == 64  # SHA-256 hex

    def test_hash_is_deterministic(self):
        raw, hashed = generate_session_token()
        assert hash_token(raw) == hashed

    def test_each_call_is_unique(self):
        tokens = {generate_session_token()[0] for _ in range(50)}
        assert len(tokens) == 50


class TestCookieName:
    def test_secure_cookies_get_host_prefix(self):
        assert cookie_name("sid", secure=True) == "__Host-sid"

    def test_insecure_cookies_have_no_prefix(self):
        # Browsers reject a __Host- cookie that isn't Secure.
        assert cookie_name("sid", secure=False) == "sid"
