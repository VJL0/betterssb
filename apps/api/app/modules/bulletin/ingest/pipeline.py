"""From a capture or a PDF to a published edition."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urldefrag

from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncConnection

from app.modules.bulletin.editions import CURRENT_EDITION, edition_root
from app.modules.bulletin.ingest.capture import CapturedResponse, read_capture
from app.modules.bulletin.ingest.courses import parse_subject_page
from app.modules.bulletin.ingest.loader import EditionLoader, slugify
from app.modules.bulletin.ingest.pages import (
    PROGRAM_INDEX_PATH,
    classify_page,
    edition_path,
    main_text,
    page_slug,
    page_title,
    parse_gened_page,
    parse_policy_page,
    policy_from_text,
)
from app.modules.bulletin.ingest.programs import (
    ProgramIndex,
    ProgramListing,
    parse_program_index,
    parse_program_page,
)
from app.modules.bulletin.ingest.store import RawObjectStore
from app.modules.bulletin.models import PageKind, ParseStatus, SourceFormat

logger = logging.getLogger(__name__)

UNDERGRADUATE_PATH = "/undergraduate/"
PDF_CONTENT_TYPE = "application/pdf"


def _canonical_path(url: str) -> str:
    path = edition_path(urldefrag(url)[0])
    return path if path.endswith("/") else f"{path}/"


def edition_responses(
    responses: list[CapturedResponse], label: str
) -> dict[str, CapturedResponse]:
    """The edition's undergraduate HTML pages, one per path.

    A capture can hold other editions, graduate pages and trailing-slash aliases;
    the first response for a path wins.
    """
    root = edition_root(label)
    archived = label != CURRENT_EDITION
    pages: dict[str, CapturedResponse] = {}
    for response in responses:
        if not response.is_html or not response.url.startswith(f"{root}/"):
            continue
        # The current edition's root is the site root, which holds the archives too.
        if ("/archives/" in response.url) != archived:
            continue
        path = _canonical_path(response.url)
        if path.startswith(UNDERGRADUATE_PATH) or path == PROGRAM_INDEX_PATH:
            pages.setdefault(path, response)
    return pages


def _program_listings(index: ProgramIndex) -> dict[str, ProgramListing]:
    """Undergraduate listings by path; a page listed twice keeps its first label."""
    listings: dict[str, ProgramListing] = {}
    for listing in index.listings:
        path = _canonical_path(listing.url)
        if path.startswith(UNDERGRADUATE_PATH):
            listings.setdefault(path, listing)
    return listings


def _program_slugs(paths: list[str]) -> dict[str, str]:
    """A program's identity is its page's last path segment, which survives a
    college's rename; two pages in one edition sharing it keep their full paths."""
    by_slug: dict[str, list[str]] = {}
    for path in paths:
        by_slug.setdefault(page_slug(path), []).append(path)
    slugs: dict[str, str] = {}
    for slug, slug_paths in by_slug.items():
        for path in slug_paths:
            slugs[path] = slug if len(slug_paths) == 1 else path.strip("/")
    return slugs


async def load_html_capture(
    connection: AsyncConnection, label: str, capture: Path, store: RawObjectStore
) -> dict[str, int]:
    pages = edition_responses(list(read_capture(capture)), label)
    index_response = pages.get(PROGRAM_INDEX_PATH)
    if index_response is None:
        raise ValueError(f"{capture} has no {PROGRAM_INDEX_PATH} page for {label}")
    index = parse_program_index(index_response.read_text(), index_response.url)
    listings = _program_listings(index)
    slugs = _program_slugs(list(listings))

    loader = EditionLoader(connection, label)
    await loader.begin(SourceFormat.HTML, str(capture))
    for path, response in sorted(pages.items()):
        await _load_page(loader, store, path, response, listings, slugs, index)
    for path in sorted(set(listings) - set(pages)):
        loader.add_issue("program_page_missing", "warning", url=listings[path].url)
    return await loader.publish(
        {
            "source": "html",
            "courses": True,
            "programs": True,
            "policies": True,
            "general_education": True,
        }
    )


async def _load_page(
    loader: EditionLoader,
    store: RawObjectStore,
    path: str,
    response: CapturedResponse,
    listings: dict[str, ProgramListing],
    slugs: dict[str, str],
    index: ProgramIndex,
) -> None:
    html = response.read_text()
    soup = BeautifulSoup(html, "lxml")
    kind = classify_page(path, set(listings))
    _, key = store.put(response.path.read_bytes(), "html")
    snapshot_id = await loader.add_snapshot(
        url=response.url,
        page_kind=kind,
        title=page_title(soup),
        sha256=response.sha256,
        fetched_at=response.fetched_at,
        content_type=response.content_type,
        raw_object_key=key,
        extracted_text=main_text(soup),
    )
    if kind is PageKind.COURSE_SUBJECT:
        subject = parse_subject_page(html)
        for title in subject.unparsed_titles:
            loader.add_issue(
                "course_heading_unparsed", "warning", snapshot_id, heading=title
            )
        await loader.add_courses(
            snapshot_id, subject.code, subject.name, subject.courses
        )
    elif kind is PageKind.PROGRAM:
        page = parse_program_page(html)
        if page.parse_status is ParseStatus.RAW:
            loader.add_issue(
                "program_without_tables", "info", snapshot_id, url=response.url
            )
        await loader.add_program(
            snapshot_id, slugs[path], listings[path], page, index.unit_names
        )
    elif kind is PageKind.GENERAL_EDUCATION:
        if gened := parse_gened_page(html):
            await loader.add_gened(snapshot_id, gened)
    elif kind is PageKind.POLICY:
        await loader.add_policy(snapshot_id, page_slug(path), parse_policy_page(html))


async def load_pdf_volume(
    connection: AsyncConnection, label: str, pdf: Path, store: RawObjectStore
) -> dict[str, int]:
    # Imported here: PyMuPDF is in the `ingest` dependency group, not the app's.
    from app.modules.bulletin.ingest.pdf import read_volume

    volume = read_volume(str(pdf))
    body = pdf.read_bytes()
    sha256, key = store.put(body, "pdf")
    loader = EditionLoader(connection, label)
    await loader.begin(SourceFormat.PDF, str(pdf))
    snapshot_id = await loader.add_snapshot(
        url=f"{edition_root(label)}/{pdf.name}",
        page_kind=PageKind.PDF_VOLUME,
        title=f"{label} Undergraduate Bulletin",
        sha256=sha256,
        fetched_at=datetime.fromtimestamp(pdf.stat().st_mtime, UTC),
        content_type=PDF_CONTENT_TYPE,
        raw_object_key=key,
        extracted_text="",
    )
    for heading in volume.unparsed_headings:
        loader.add_issue(
            "course_heading_unparsed", "warning", snapshot_id, heading=heading
        )
    by_subject: dict[str, list] = {}
    for course in volume.courses:
        by_subject.setdefault(course.subject, []).append(course)
    for subject, courses in sorted(by_subject.items()):
        await loader.add_courses(
            snapshot_id, subject, volume.subjects.get(subject, ""), courses
        )
    for policy in volume.policies:
        await loader.add_policy(
            snapshot_id,
            slugify(policy.title),
            policy_from_text(policy.title, policy.body_text),
        )
    return await loader.publish(
        {
            "source": "pdf",
            "courses": True,
            "programs": False,
            "policies": True,
            "general_education": False,
        }
    )
