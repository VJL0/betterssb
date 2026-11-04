"""Vercel's build step for the API: migrates the production database.

    python scripts/vercel_build.py   ([tool.vercel.scripts] in pyproject.toml)

Vercel runs it after installing dependencies and before the new version goes
live, so the migration lands first, and a failed one fails the deploy while
the previous version keeps serving. Preview builds skip it, so a pull request
never changes production's schema before it's merged.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from alembic.config import Config

from alembic import command

API_DIR = Path(__file__).resolve().parent.parent
PRODUCTION = "production"


def main() -> None:
    environment = os.environ.get("VERCEL_ENV", "")
    if environment != PRODUCTION:
        print(f"Skipping migrations: VERCEL_ENV is {environment or 'unset'}.")
        return
    # Alembic's env.py imports the app package, which lives in API_DIR.
    sys.path.insert(0, str(API_DIR))
    command.upgrade(Config(str(API_DIR / "alembic.ini")), "head")


if __name__ == "__main__":
    main()
