from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from app.core.openapi import PROBLEM_MEDIA_TYPE, build_openapi
from app.main import app

COMMITTED_SCHEMA = Path(__file__).resolve().parents[2] / "openapi.json"


def _operations() -> list[tuple[str, str, dict]]:
    return [
        (path, method, operation)
        for path, operations in build_openapi(app)["paths"].items()
        for method, operation in operations.items()
    ]


def test_committed_schema_is_current():
    """packages/api-client is generated from openapi.json; regenerate it with
    `uv run python -m scripts.export_openapi` after changing the API."""
    assert json.loads(COMMITTED_SCHEMA.read_text()) == build_openapi(app)


def test_operation_ids_are_unique_function_names():
    counts = Counter(operation["operationId"] for _, _, operation in _operations())
    assert [name for name, n in counts.items() if n > 1] == []
    assert all(name.isidentifier() for name in counts)


def test_errors_are_documented_as_problem_details():
    for path, method, operation in _operations():
        for code in ("4XX", "5XX"):
            content = operation["responses"][code]["content"]
            assert list(content) == [PROBLEM_MEDIA_TYPE], (method, path, code)
            assert content[PROBLEM_MEDIA_TYPE]["schema"] == {
                "$ref": "#/components/schemas/Problem"
            }


def test_response_fields_with_defaults_are_required():
    schemas = build_openapi(app)["components"]["schemas"]
    assert "seatsAvailable" in schemas["ClassSection"]["required"]
    assert "type" in schemas["Problem"]["required"]
