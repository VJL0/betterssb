"""Error responses as RFC 9457 problem details (`application/problem+json`).

Endpoints raise `HTTPException` as usual; these handlers replace FastAPI's default
`{"detail": ...}` bodies. Every problem uses the `about:blank` type, so `title` is
the status phrase and `detail`, when present, is a message safe to show users.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.security import SECURITY_HEADERS


def problem(
    status: int,
    detail: str | None = None,
    *,
    headers: dict[str, str] | None = None,
    **extensions: Any,
) -> JSONResponse:
    title = HTTPStatus(status).phrase
    body: dict[str, Any] = {"type": "about:blank", "title": title, "status": status}
    if detail and detail != title:
        body["detail"] = detail
    return JSONResponse(
        body | extensions,
        status_code=status,
        headers=headers,
        media_type="application/problem+json",
    )


async def handle_http_exception(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    # Also catches Starlette's own 404/405s.
    return problem(exc.status_code, exc.detail, headers=exc.headers)


async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Leaves out Pydantic's `input`, which echoes request data back.
    return problem(422, errors=[_validation_error(e) for e in exc.errors()])


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # Starlette re-raises `exc` after this so the server logs the traceback. The
    # response skips app middleware, so it sets the security headers itself.
    return problem(500, headers=SECURITY_HEADERS)


def _validation_error(error: dict[str, Any]) -> dict[str, Any]:
    """One item of the `errors` extension: a JSON Pointer (RFC 6901) into the body,
    as in RFC 9457's example, or the parameter's OpenAPI `in` and `name`.
    """
    where, *path = error["loc"]
    if where == "body":
        tokens = (str(p).replace("~", "~0").replace("/", "~1") for p in path)
        return {
            "detail": error["msg"],
            "pointer": "#" + "".join(f"/{t}" for t in tokens),
        }
    return {"detail": error["msg"], "in": where, "name": str(path[0])}


def add_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
