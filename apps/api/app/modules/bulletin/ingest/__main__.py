"""The Bulletin ingester's command line. Run from apps/api:

    uv run python -m app.modules.bulletin.ingest <command> [options]

Commands run in pipeline order; each reads what the previous one wrote under
data/bulletin (or $BULLETIN_DATA_DIR). Only `discover` and `fetch` touch the
network, and both honour robots.txt. `import`, `publish`, `prune` and `report`
write to or read from Postgres, always at an explicit `--database-url`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from pathlib import Path

import asyncpg

from app.core.config import to_asyncpg_url
from app.modules.bulletin.ingest import paths
from app.modules.bulletin.ingest.captures import import_capture, import_file
from app.modules.bulletin.ingest.checkpoint import create_checkpoint, verify_checkpoint
from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.crawler import (
    Crawler,
    current_seed_urls,
    legacy_seed_urls,
    rebuild_link_graph,
)
from app.modules.bulletin.ingest.fetcher import PoliteFetcher, new_client
from app.modules.bulletin.ingest.manifest import export_manifest, mark_duplicates
from app.modules.bulletin.ingest.store import ObjectStore
from app.modules.bulletin.ingest.urls import BULLETIN_HOST, LEGACY_HOST, classify_url

logger = logging.getLogger("bulletin.ingest")

HOSTS_BY_TARGET = {
    "current": frozenset({BULLETIN_HOST}),
    "legacy": frozenset({LEGACY_HOST}),
    "all": frozenset({BULLETIN_HOST, LEGACY_HOST}),
}


def to_asyncpg_dsn(url: str) -> str:
    """asyncpg takes plain `postgresql://` URLs, not SQLAlchemy's driver form."""
    return to_asyncpg_url(url).replace("postgresql+asyncpg://", "postgresql://", 1)


def open_state() -> CrawlState:
    return CrawlState(paths.crawl_state_path())


def open_store() -> ObjectStore:
    return ObjectStore(paths.objects_dir())


async def crawl(args: argparse.Namespace, follow_links: bool) -> None:
    state = open_state()
    hosts = HOSTS_BY_TARGET[args.target]
    try:
        async with new_client() as client:
            fetcher = PoliteFetcher(client, min_interval=args.interval)
            crawler = Crawler(
                state,
                open_store(),
                fetcher,
                hosts,
                # Without following links, one round fetches what's pending.
                max_rounds=None if follow_links else 1,
            )
            if follow_links:
                seeds = []
                if BULLETIN_HOST in hosts:
                    seeds += current_seed_urls()
                if LEGACY_HOST in hosts:
                    seeds += legacy_seed_urls()
                crawler.seed(seeds)
            for url in args.url or []:
                crawler.seed([url], "targeted")
            if args.refresh:
                prefix = args.refresh if isinstance(args.refresh, str) else ""
                logger.info("Requeued %d URLs", state.requeue_fetched(prefix))
                state.commit()
            if args.dry_run:
                pending = state.pending(hosts)
                logger.info("Would fetch %d URLs, e.g.:", len(pending))
                for row in pending[:20]:
                    logger.info("  %s", row["url"])
                return
            summary = await crawler.run(max_pages=args.max_pages)
            logger.info("Crawl finished: %s", summary)
    finally:
        state.close()


def cmd_import_capture(args: argparse.Namespace) -> None:
    state = open_state()
    try:
        summary = import_capture(state, open_store(), args.directory, args.method)
        logger.info("Imported %s", summary)
    finally:
        state.close()


def cmd_import_file(args: argparse.Namespace) -> None:
    state = open_state()
    try:
        sha256 = import_file(state, open_store(), args.path, args.url, args.method)
        logger.info("Imported %s as %s", args.url, sha256)
    finally:
        state.close()


def cmd_manifest(args: argparse.Namespace) -> None:
    state = open_state()
    try:
        logger.info("Marked %d duplicate URLs", mark_duplicates(state))
        jsonl, csv_path, count = export_manifest(state, args.output)
        logger.info("Wrote %d URLs to %s and %s", count, jsonl, csv_path)
    finally:
        state.close()


def cmd_extract(args: argparse.Namespace) -> None:
    # Imported here: extraction pulls in every parser, the crawl commands don't.
    from app.modules.bulletin.ingest.extract.run import (
        extract_edition,
        write_extraction,
    )

    state = open_state()
    try:
        logger.info("Marked %d duplicate URLs", mark_duplicates(state))
        for edition in args.edition:
            result = extract_edition(state, open_store(), edition)
            counts = write_extraction(result, paths.extracted_dir() / edition)
            logger.info("Extracted %s: %s", edition, counts)
    finally:
        state.close()


def cmd_extract_pdf(args: argparse.Namespace) -> None:
    # Needs the `ingest` dependency group (pdfplumber).
    from app.modules.bulletin.ingest.extract.pdf import extract_edition_pdfs

    state = open_state()
    try:
        for edition in args.edition:
            directory = paths.extracted_dir() / edition / "pdf"
            counts = extract_edition_pdfs(state, open_store(), edition, directory)
            logger.info("Extracted %s PDFs: %s", edition, counts)
    finally:
        state.close()


def cmd_relink(_: argparse.Namespace) -> None:
    state = open_state()
    try:
        logger.info("Reclassified %d URLs", state.reclassify(classify_url))
        logger.info("Rebuilt %d links", rebuild_link_graph(state, open_store()))
    finally:
        state.close()


def cmd_status(_: argparse.Namespace) -> None:
    state = open_state()
    try:
        for key, count in sorted(state.counts().items()):
            print(f"{key:40} {count:>8}")
    finally:
        state.close()


def cmd_interpret(args: argparse.Namespace) -> None:
    from app.modules.bulletin.ingest.interpret.run import interpret_edition

    state = open_state()
    try:
        for edition in args.edition:
            summary = interpret_edition(
                state,
                paths.extracted_dir() / edition,
                paths.interpreted_dir() / edition,
            )
            logger.info("Interpreted %s: %s", edition, summary.counts)
    finally:
        state.close()


async def with_database[T](
    url: str, action: Callable[[asyncpg.Connection], Awaitable[T]]
) -> T:
    connection = await asyncpg.connect(to_asyncpg_dsn(url))
    try:
        return await action(connection)
    finally:
        await connection.close()


def cmd_import(args: argparse.Namespace) -> None:
    from app.modules.bulletin.ingest.load import import_edition, publish_batch

    state = open_state()

    async def run(connection: asyncpg.Connection) -> None:
        for edition in args.edition:
            directory = paths.interpreted_dir() / edition
            if args.dry_run:
                logger.info("Would import %s from %s", edition, directory)
                continue
            result = await import_edition(connection, state, directory)
            logger.info(
                "%s batch %d (%s): %s",
                edition,
                result.batch_id,
                "new" if result.created else "already imported",
                result.counts,
            )
            if args.publish:
                logger.info(
                    "Published: %s", await publish_batch(connection, result.batch_id)
                )

    try:
        asyncio.run(with_database(args.database_url, run))
    finally:
        state.close()


def cmd_publish(args: argparse.Namespace) -> None:
    from app.modules.bulletin.ingest.load import publish_batch

    async def run(connection: asyncpg.Connection) -> None:
        result = await publish_batch(connection, args.batch, dry_run=args.dry_run)
        logger.info("Publish: %s", result)

    asyncio.run(with_database(args.database_url, run))


def cmd_prune(args: argparse.Namespace) -> None:
    from app.modules.bulletin.ingest.load import prune_batch

    async def run(connection: asyncpg.Connection) -> None:
        await prune_batch(connection, args.batch)
        logger.info("Pruned batch %d", args.batch)

    asyncio.run(with_database(args.database_url, run))


def cmd_report(args: argparse.Namespace) -> None:
    from app.modules.bulletin.ingest.report import build_report

    state = open_state()
    try:
        report = asyncio.run(
            with_database(args.database_url, lambda c: build_report(c, state))
        )
    finally:
        state.close()
    text = json.dumps(report, indent=2, sort_keys=True, default=str)
    if args.output:
        args.output.write_text(text + "\n")
        logger.info("Wrote %s", args.output)
    else:
        print(text)


def add_database_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--database-url",
        required=True,
        help="Postgres URL to write to; the app's DATABASE_URL is never used",
    )


def add_crawl_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--target", choices=sorted(HOSTS_BY_TARGET), default="current")
    parser.add_argument("--url", action="append", help="also fetch this URL")
    parser.add_argument(
        "--refresh",
        nargs="?",
        const=True,
        default=False,
        metavar="URL_PREFIX",
        help="re-fetch already fetched URLs with conditional requests",
    )
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--interval", type=float, default=1.0, help="seconds per host")
    parser.add_argument("--dry-run", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.modules.bulletin.ingest")
    commands = parser.add_subparsers(dest="command", required=True)

    discover = commands.add_parser(
        "discover", help="crawl from the seeds until no new URLs turn up"
    )
    add_crawl_options(discover)
    fetch = commands.add_parser(
        "fetch", help="fetch pending or given URLs without following links"
    )
    add_crawl_options(fetch)

    capture = commands.add_parser(
        "import-capture", help="record an earlier capture directory's responses"
    )
    capture.add_argument("directory", type=Path)
    capture.add_argument("--method", default="prior_capture")

    file = commands.add_parser(
        "import-file", help="record a hand-downloaded file under its official URL"
    )
    file.add_argument("path", type=Path)
    file.add_argument("--url", required=True)
    file.add_argument("--method", default="manual_download")

    manifest = commands.add_parser("manifest", help="export the URL manifest")
    manifest.add_argument("--output", type=Path, default=paths.manifests_dir())

    extract = commands.add_parser(
        "extract", help="parse an edition's snapshots into typed JSONL (offline)"
    )
    extract.add_argument("--edition", action="append", required=True)

    extract_pdf = commands.add_parser(
        "extract-pdf",
        help="parse an edition's PDFs into typed JSONL (offline; --group ingest)",
    )
    extract_pdf.add_argument("--edition", action="append", required=True)

    commands.add_parser(
        "relink",
        help="re-apply scope rules; rebuild links and discovery methods offline",
    )
    commands.add_parser("status", help="URL counts by scope and outcome")
    checkpoint = commands.add_parser("checkpoint", help="create an offline handoff")
    checkpoint.add_argument("--output", type=Path, required=True)
    verify = commands.add_parser("verify-checkpoint", help="verify a handoff offline")
    verify.add_argument("directory", type=Path)
    commands.add_parser(
        "validate-extracts", help="check retained records and provenance offline"
    )
    interpret = commands.add_parser(
        "interpret",
        help="turn an edition's extracts into requirement trees and records (offline)",
    )
    interpret.add_argument("--edition", action="append", required=True)
    load = commands.add_parser(
        "import", help="load interpreted editions into Postgres as staged batches"
    )
    load.add_argument("--edition", action="append", required=True)
    load.add_argument("--publish", action="store_true", help="publish if gates pass")
    load.add_argument("--dry-run", action="store_true")
    add_database_option(load)
    publish = commands.add_parser(
        "publish", help="publish a batch (an older batch rolls the edition back)"
    )
    publish.add_argument("batch", type=int)
    publish.add_argument("--dry-run", action="store_true", help="only run the gates")
    add_database_option(publish)
    prune = commands.add_parser("prune", help="delete a never-published batch")
    prune.add_argument("batch", type=int)
    add_database_option(prune)
    report = commands.add_parser(
        "report", help="coverage and quality report from the crawl and database"
    )
    report.add_argument("--output", type=Path)
    add_database_option(report)
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    args = build_parser().parse_args()
    if os.environ.get("ENVIRONMENT") != "development":
        raise SystemExit("Bulletin ingestion requires ENVIRONMENT=development")
    match args.command:
        case "validate-extracts":
            from app.modules.bulletin.ingest.validate import validate_extracts

            print(
                json.dumps(
                    validate_extracts(paths.data_dir()), indent=2, sort_keys=True
                )
            )
        case "checkpoint":
            logger.info(
                "Checkpoint: %s", create_checkpoint(paths.data_dir(), args.output)
            )
        case "verify-checkpoint":
            logger.info("Verified: %s", verify_checkpoint(args.directory))
        case "discover":
            asyncio.run(crawl(args, follow_links=True))
        case "fetch":
            asyncio.run(crawl(args, follow_links=False))
        case "import-capture":
            cmd_import_capture(args)
        case "import-file":
            cmd_import_file(args)
        case "manifest":
            cmd_manifest(args)
        case "extract":
            cmd_extract(args)
        case "extract-pdf":
            cmd_extract_pdf(args)
        case "relink":
            cmd_relink(args)
        case "status":
            cmd_status(args)
        case "interpret":
            cmd_interpret(args)
        case "import":
            cmd_import(args)
        case "publish":
            cmd_publish(args)
        case "prune":
            cmd_prune(args)
        case "report":
            cmd_report(args)


if __name__ == "__main__":
    main()
