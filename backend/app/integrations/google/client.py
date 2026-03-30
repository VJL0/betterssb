from __future__ import annotations

import httpx

GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"


class GoogleAuthClient:
    def __init__(self, client_id: str) -> None:
        self._client_id = client_id

    async def verify_id_token(self, credential: str) -> dict:
        """Verify a Google ID token and return its claims."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                GOOGLE_TOKEN_INFO_URL,
                params={"id_token": credential},
            )
            resp.raise_for_status()
            claims = resp.json()

        aud = claims.get("aud", "")
        if aud != self._client_id:
            raise ValueError(f"Token audience mismatch: {aud}")

        return claims
