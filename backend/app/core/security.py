from __future__ import annotations

import hashlib
import secrets

SESSION_COOKIE = "sid"
OAUTH_STATE_COOKIE = "oauth_state"


def cookie_name(name: str, secure: bool) -> str:
    """Prefix secure cookies with `__Host-` so other subdomains can't overwrite them."""
    return f"__Host-{name}" if secure else name


def generate_session_token() -> tuple[str, str]:
    """Return a random session token and its SHA-256 hash."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
