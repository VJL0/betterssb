from __future__ import annotations

import hashlib

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# OWASP REST Security Cheat Sheet, "Security Headers". Endpoints may override any
# of these, e.g. to allow caching of public data.
SECURITY_HEADERS = {
    # Responses are per user (cookie sessions), and shared caches don't protect
    # cookie-authenticated requests the way they do `Authorization` (RFC 9111 §3.5).
    "Cache-Control": "no-store",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    # Legacy fallback for frame-ancestors.
    "X-Frame-Options": "DENY",
}


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class SecurityHeadersMiddleware:
    """Pure ASGI middleware that adds `SECURITY_HEADERS` to every HTTP response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)
