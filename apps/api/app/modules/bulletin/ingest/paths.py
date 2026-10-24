"""Where the ingester keeps its working files.

Everything here is regenerable from Temple's sources except fetched bytes of
pages that have since changed, which is why snapshots are kept by hash and never
overwritten. The directory is git-ignored (`data/`).
"""

from __future__ import annotations

import os
from pathlib import Path

# apps/api/app/modules/bulletin/ingest/paths.py → the repository root.
REPOSITORY_ROOT = Path(__file__).resolve().parents[6]
DATA_DIR_ENV = "BULLETIN_DATA_DIR"


def data_dir() -> Path:
    """`BULLETIN_DATA_DIR`, else `<repo>/data/bulletin`."""
    configured = os.environ.get(DATA_DIR_ENV)
    return (
        Path(configured).expanduser().resolve()
        if configured
        else (REPOSITORY_ROOT / "data" / "bulletin")
    )


def objects_dir() -> Path:
    return data_dir() / "objects"


def crawl_state_path() -> Path:
    return data_dir() / "crawl.sqlite3"


def manifests_dir() -> Path:
    return data_dir() / "manifests"


def extracted_dir() -> Path:
    return data_dir() / "extracted"


def reports_dir() -> Path:
    return data_dir() / "reports"


def inbox_dir() -> Path:
    """Where hand-downloaded sources go (PDFs robots.txt keeps us from fetching)."""
    return data_dir() / "inbox"
