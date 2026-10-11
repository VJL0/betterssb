from __future__ import annotations

from typing import Any

from authlib.common.errors import AuthlibBaseError
from authlib.integrations.starlette_client import OAuth
from joserfc.errors import JoseError
from starlette.requests import Request
from starlette.responses import RedirectResponse

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
# Google issues both; its discovery document lists only the first.
GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
# Time allowed to finish signing in at Google.
HANDSHAKE_TTL_SECONDS = 10 * 60


class GoogleAuthError(Exception):
    """A failed Google sign-in. `error` is an OAuth error code, e.g. `access_denied`."""

    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class GoogleOAuthClient:
    """Google sign-in through Authlib, using PKCE, state, and nonce.

    State, nonce, and the PKCE verifier are kept in `cache`. The session cookie only holds
    a marker that ties the callback to the browser that started sign-in.
    """

    def __init__(self, client_id: str, client_secret: str, cache: Any) -> None:
        oauth = OAuth(cache=cache)
        self._app = oauth.register(
            "google",
            client_id=client_id,
            client_secret=client_secret,
            server_metadata_url=GOOGLE_DISCOVERY_URL,
            client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
        )
        # Expire cached state with the handshake cookie instead of after Authlib's default hour.
        self._app.framework.expires_in = HANDSHAKE_TTL_SECONDS

    async def authorize_redirect(self, request: Request, redirect_uri: str) -> RedirectResponse:
        """Redirect to Google, letting the user pick which account to sign in with."""
        return await self._app.authorize_redirect(request, redirect_uri, prompt="select_account")

    async def authorize(self, request: Request) -> dict[str, Any]:
        """Exchange the callback's code and return the verified ID token claims.

        Raises:
            GoogleAuthError: The user declined, the state didn't match, or the ID token is invalid.
        """
        try:
            token = await self._app.authorize_access_token(
                request,
                claims_options={"iss": {"essential": True, "values": GOOGLE_ISSUERS}},
            )
        except AuthlibBaseError as exc:
            raise GoogleAuthError(exc.error or "oauth_error") from exc
        except JoseError as exc:
            raise GoogleAuthError("invalid_id_token") from exc

        claims = token.get("userinfo")
        if not claims:
            raise GoogleAuthError("missing_id_token")
        return dict(claims)
