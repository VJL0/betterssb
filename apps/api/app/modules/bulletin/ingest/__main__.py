"""The Bulletin ingester's command line. Run from apps/api:

    uv run python -m app.modules.bulletin.ingest <command> [options]

Commands run in pipeline order; each reads what the previous one wrote under
data/bulletin (or $BULLETIN_DATA_DIR). Only `discover` and `fetch` touch the
network, and both honour robots.txt.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path

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
        case "relink":
            cmd_relink(args)
        case "status":
            cmd_status(args)


if __name__ == "__main__":
    main()
