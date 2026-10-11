from __future__ import annotations

import hashlib
import secrets

SESSION_COOKIE = "sid"
OAUTH_STATE_COOKIE = "oauth_state"


def cookie_name(name: str, secure: bool) -> str:
    """Prefix secure cookies with `__Host-Http-` so only this host's server can set them.

    Browsers then require `Secure`, `HttpOnly`, `Path=/`, and no `Domain`, and refuse the
    cookie from other subdomains or JavaScript. Browsers that predate `__Host-Http-` still
    enforce the `__Host-` rules.
    """
    return f"__Host-Http-{name}" if secure else name


def generate_session_token() -> tuple[str, str]:
    """Return a random session token and its SHA-256 hash."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
