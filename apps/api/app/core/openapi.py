"""The OpenAPI document that clients are generated from (packages/api-client).

Two things keep generated code stable and honest:

- Operation IDs are the route function names (`list_terms`), so SDK function
  names don't change when a path or method does.
- Error responses are documented as the RFC 9457 problem details the handlers in
  `app.core.errors` actually send, instead of FastAPI's default `{"detail": ...}`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

from app.core.errors import PROBLEM_MEDIA_TYPE, Problem

PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    "4XX": {"model": Problem, "description": "Client error, as problem details"},
    "5XX": {"model": Problem, "description": "Server error, as problem details"},
}


def operation_id(route: APIRoute) -> str:
    """The route's function name. `test_openapi` checks they're unique."""
    return route.name


def _use_problem_media_type(schema: dict[str, Any]) -> None:
    # FastAPI files every `responses` model under application/json.
    for operations in schema.get("paths", {}).values():
        for operation in operations.values():
            for code, response in operation.get("responses", {}).items():
                content = response.get("content", {})
                if code[0] in "45" and "application/json" in content:
                    content[PROBLEM_MEDIA_TYPE] = content.pop("application/json")


def build_openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema is None:
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        _use_problem_media_type(schema)
        app.openapi_schema = schema
    return app.openapi_schema


def write_openapi(app: FastAPI, path: Path) -> None:
    """Writes the schema with sorted keys, so it diffs cleanly and only changes with the API."""
    text = json.dumps(build_openapi(app), indent=2, sort_keys=True, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")
