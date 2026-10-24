"""The Bulletin editions BetterSSB covers, and where each one lives online."""

from __future__ import annotations

import re

from app.modules.bulletin.ingest.crawler import BULLETIN_ORIGIN

SUPPORTED_EDITIONS = ("2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026-2027")
CURRENT_EDITION = "2026-2027"
EDITION_LABEL = re.compile(r"^(?P<start>[0-9]{4})-(?P<end>[0-9]{4})$")


def academic_year_start(label: str) -> int:
    match = EDITION_LABEL.match(label)
    if not match or int(match["end"]) != int(match["start"]) + 1:
        raise ValueError(f"Not an edition label: {label!r}")
    return int(match["start"])


def edition_root(label: str) -> str:
    """The edition's URL root: the live site for the current one, else its archive."""
    if label == CURRENT_EDITION:
        return BULLETIN_ORIGIN
    return f"{BULLETIN_ORIGIN}/archives/{label}"
