"""Records read from a PDF volume cite the volume, while keeping the Bulletin
page they stand for as their URL."""

from __future__ import annotations

from app.modules.bulletin.ingest.extract.classify import PageKind
from app.modules.bulletin.ingest.extract.run import ExtractedPage
from app.modules.bulletin.ingest.interpret import catalog
from app.modules.bulletin.ingest.interpret.run import policy_out
from app.modules.bulletin.ingest.records import Block, Locator, PageDocument

PAGE_URL = (
    "https://bulletin.temple.edu/undergraduate/academic-policies/repeating-course/"
)
VOLUME_URL = "https://bulletin.temple.edu/pdf/2026-2027-undergraduate.pdf"
VOLUME_SHA256 = "a" * 64


def volume_page(source_url: str | None) -> ExtractedPage:
    return ExtractedPage(
        kind=PageKind.POLICY,
        document=PageDocument(
            url=PAGE_URL,
            sha256=VOLUME_SHA256,
            source_url=source_url,
            title="Repeating a Course",
            heading="Repeating a Course",
            blocks=[
                Block(
                    index=0,
                    kind="paragraph",
                    text="Students may repeat a course once.",
                    section=["Policy Statement"],
                    locator=Locator(page=412, bbox=(54.0, 120.0, 540.0, 132.0)),
                )
            ],
        ),
    )


def test_volume_sections_cite_the_volume() -> None:
    [section] = catalog.policy_sections(volume_page(VOLUME_URL), "2026-2027")
    record = policy_out(section, 0)
    assert record.url == PAGE_URL
    assert record.snapshot_url == VOLUME_URL
    assert all(source.url == VOLUME_URL for source in record.sources)
    assert record.sources[0].page == 412


def test_html_pages_cite_themselves() -> None:
    [section] = catalog.policy_sections(volume_page(None), "2026-2027")
    record = policy_out(section, 0)
    assert record.source_url is None
    assert record.snapshot_url == PAGE_URL
    assert record.sources[0].url == PAGE_URL
