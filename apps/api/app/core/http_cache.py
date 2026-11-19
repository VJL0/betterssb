"""HTTP caching for public read endpoints (RFC 9111).

The API answers `no-store` by default (`app.core.security`). Data that's the same
for every caller is marked `public` so browsers keep it for `max-age` and Vercel's
CDN for `s-maxage`, which spares Banner, the Bulletin and the API repeat requests.
Only successful answers carry it; errors keep `no-store`.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Response


def public_cache_control(seconds: int) -> str:
    return f"public, max-age={seconds}, s-maxage={seconds}"


def cached_publicly(seconds: int) -> dict[str, Any]:
    """Route options that cache a successful answer for `seconds`, documented
    in OpenAPI as Zalando's guidelines ask for cacheable endpoints."""
    value = public_cache_control(seconds)

    def set_cache_control(response: Response) -> None:
        response.headers["Cache-Control"] = value

    return {
        "dependencies": [Depends(set_cache_control)],
        "responses": {
            200: {
                "headers": {
                    "Cache-Control": {
                        "description": "How long browsers and the CDN may reuse this.",
                        "schema": {"type": "string", "example": value},
                    }
                }
            }
        },
    }
