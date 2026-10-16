from __future__ import annotations

from typing import Any

import httpx2
from authlib.common.errors import AuthlibBaseError
from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App
from joserfc.errors import JoseError
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.modules.auth.errors import SignInError

# Google issues both; its discovery document lists only the first.
GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
# Time allowed to finish signing in at Google, enforced by the handshake cookie.
HANDSHAKE_TTL_SECONDS = 10 * 60


def create_google_client(
    client_id: str, client_secret: str, cache: Any
) -> StarletteOAuth2App:
    """Register Google sign-in with Authlib, using PKCE, state, and nonce.

    State, nonce, and the PKCE verifier are kept in `cache`. The handshake cookie
    only holds a marker that ties the callback to the browser that started sign-in.
    """
    return OAuth(cache=cache).register(
        "google",
        client_id=client_id,
        client_secret=client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={
            "scope": "openid email profile",
            "code_challenge_method": "S256",
        },
    )


async def authorize_redirect(
    google: StarletteOAuth2App, request: Request, redirect_uri: str
) -> RedirectResponse:
    """Redirect to Google, letting the user pick which account to sign in with.

    Raises:
        SignInError: Google couldn't be reached.
    """
    try:
        return await google.authorize_redirect(
            request, redirect_uri, prompt="select_account"
        )
    except httpx2.HTTPError as exc:
        raise SignInError(
            "failed", f"Google unreachable: {type(exc).__name__}"
        ) from exc


async def authorize(google: StarletteOAuth2App, request: Request) -> dict[str, Any]:
    """Exchange the callback's code and return the verified ID token claims.

    Raises:
        SignInError: The user declined, the state didn't match, the ID token is
            invalid, or Google couldn't be reached.
    """
    try:
        token = await google.authorize_access_token(
            request,
            claims_options={"iss": {"essential": True, "values": GOOGLE_ISSUERS}},
        )
    except AuthlibBaseError as exc:
        # Only a cancel is passed on; other OAuth errors aren't reflected.
        reason = "access_denied" if exc.error == "access_denied" else "failed"
        raise SignInError(reason, f"OAuth error: {exc.error}") from exc
    except JoseError as exc:
        raise SignInError("failed", f"invalid ID token: {type(exc).__name__}") from exc
    except httpx2.HTTPError as exc:
        raise SignInError(
            "failed", f"Google unreachable: {type(exc).__name__}"
        ) from exc

    claims = token.get("userinfo")
    if not claims:
        raise SignInError("failed", "no ID token in Google's response")
    return dict(claims)
