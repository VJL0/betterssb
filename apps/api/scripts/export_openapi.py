"""Writes the API's OpenAPI schema to apps/api/openapi.json.

    uv run python -m scripts.export_openapi   (or `pnpm api:generate` from the root)

packages/api-client generates its TypeScript client from that file, and
`tests/integration/test_openapi.py` fails when it's out of date.
"""

from __future__ import annotations

import os
from pathlib import Path

# The schema doesn't depend on secrets, but Settings refuses to load without them.
os.environ.setdefault("GOOGLE_CLIENT_ID", "openapi-export")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "openapi-export")
os.environ.setdefault("SESSION_SECRET", "openapi-export-not-a-real-secret-value")

from app.core.openapi import write_openapi
from app.main import app

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "openapi.json"

if __name__ == "__main__":
    write_openapi(app, SCHEMA_PATH)
    print(f"Wrote {SCHEMA_PATH}")
