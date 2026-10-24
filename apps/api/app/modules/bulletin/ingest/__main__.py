"""Bulletin ingestion.

    uv run python -m app.modules.bulletin.ingest crawl
    uv run python -m app.modules.bulletin.ingest load-html --edition 2026-2027
    uv run --group ingest python -m app.modules.bulletin.ingest load-pdf \\
        --edition 2025-2026 --pdf ~/Downloads/2025-2026-undergraduate.pdf
    uv run python -m app.modules.bulletin.ingest status

The database is DATABASE_URL_UNPOOLED, else DATABASE_URL, as for Alembic.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import DatabaseSettings
from app.modules.bulletin.editions import CURRENT_EDITION, SUPPORTED_EDITIONS
from app.modules.bulletin.ingest.crawler import crawl_current_edition
from app.modules.bulletin.ingest.loader import edition_counts
from app.modules.bulletin.ingest.pipeline import load_html_capture, load_pdf_volume
from app.modules.bulletin.ingest.store import RawObjectStore

REPOSITORY_ROOT = Path(__file__).resolve().parents[6]
logger = logging.getLogger(__name__)

DATA_DIR = REPOSITORY_ROOT / "data" / "bulletin"
DEFAULT_STORE = DATA_DIR / "raw"


def default_capture(edition: str) -> Path:
    return DATA_DIR / edition / "capture"


async def run_load(args: argparse.Namespace) -> None:
    engine = create_async_engine(DatabaseSettings().migration_database_url)
    store = RawObjectStore(args.store)
    try:
        async with engine.begin() as connection:
            if args.command == "load-html":
                capture = args.capture or default_capture(args.edition)
                counts = await load_html_capture(
                    connection, args.edition, capture, store
                )
            else:
                counts = await load_pdf_volume(
                    connection, args.edition, args.pdf, store
                )
        logger.info("Published %s: %s", args.edition, counts)
    finally:
        await engine.dispose()


async def run_status() -> None:
    engine = create_async_engine(DatabaseSettings().migration_database_url)
    try:
        async with engine.connect() as connection:
            for label, status, courses in await edition_counts(connection):
                print(f"{label}  {status:9}  {courses} courses")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.modules.bulletin.ingest")
    commands = parser.add_subparsers(dest="command", required=True)

    crawl = commands.add_parser(
        "crawl", help=f"Capture the live {CURRENT_EDITION} site"
    )
    crawl.add_argument("--output", type=Path, default=default_capture(CURRENT_EDITION))

    for name, help_text in (
        ("load-html", "Load an edition from an HTML capture"),
        ("load-pdf", "Load an edition's courses and policies from its volume PDF"),
    ):
        load = commands.add_parser(name, help=help_text)
        load.add_argument("--edition", choices=SUPPORTED_EDITIONS, required=True)
        load.add_argument("--store", type=Path, default=DEFAULT_STORE)
        if name == "load-html":
            load.add_argument("--capture", type=Path)
        else:
            load.add_argument("--pdf", type=Path, required=True)

    commands.add_parser("status", help="List loaded editions")

    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.command == "crawl":
        logger.info("Captured %d pages", crawl_current_edition(args.output))
    elif args.command == "status":
        asyncio.run(run_status())
    else:
        asyncio.run(run_load(args))


if __name__ == "__main__":
    main()
