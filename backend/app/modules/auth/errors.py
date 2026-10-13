from __future__ import annotations

from typing import Literal

# Sent to the frontend as `?auth_error=`. `access_denied` is the OAuth error code
# for a user who cancels (RFC 6749 §4.1.2.1).
SignInFailure = Literal["access_denied", "failed", "account_disabled"]


class SignInError(Exception):
    """Sign-in didn't complete.

    `reason` goes to the frontend. The message is for logs only and may include
    values from the callback URL, so log it with `%r`.
    """

    reason: SignInFailure

    def __init__(self, reason: SignInFailure, message: str) -> None:
        super().__init__(message)
        self.reason = reason
