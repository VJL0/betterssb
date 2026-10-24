"""Typed intermediate records: what extraction produces and loading consumes.

Extraction is a pure function of snapshot bytes, so these records can be
regenerated at any time and diffed between parser versions. Every record that
states a fact carries `Evidence`: the snapshot's hash and a locator precise
enough to find the exact passage again (an XPath and source line in HTML, a
page and bounding box in a PDF).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)


class Locator(Record):
    """Where a passage sits in its snapshot."""

    # HTML: absolute XPath into the parsed document, and the source line.
    xpath: str | None = None
    line: int | None = None
    # CourseLeaf tab container (`requirementstextcontainer`), if any.
    tab: str | None = None
    # PDF: 1-based page and bounding box in points (x0, y0, x1, y1).
    page: int | None = None
    bbox: tuple[float, float, float, float] | None = None


class Evidence(Record):
    url: str
    sha256: str
    locator: Locator
    # The passage as extracted (whitespace-normalized), for display and checks.
    text: str


BlockKind = Literal[
    "heading",
    "paragraph",
    "list_item",
    "definition_term",
    "definition",
    "table",
    "course_block",
    "preformatted",
    "text",
]


class Block(Record):
    """One readable unit of a page, in document order."""

    index: int
    kind: BlockKind
    text: str
    level: int | None = None
    # Headings above this block, outermost first, within its tab.
    section: list[str] = Field(default_factory=list)
    locator: Locator


class Crumb(Record):
    text: str
    url: str | None = None


class Tab(Record):
    id: str
    label: str


class Link(Record):
    url: str
    text: str
    block_index: int | None = None


class PageDocument(Record):
    """A page's readable structure, independent of what kind of page it is."""

    url: str
    sha256: str
    title: str
    heading: str
    # The snapshot's own URL when it isn't the page's: a section of a full
    # PDF volume is the page `url`, read from the volume at `source_url`.
    source_url: str | None = None
    edition_label: str | None = None
    breadcrumbs: list[Crumb] = Field(default_factory=list)
    tabs: list[Tab] = Field(default_factory=list)
    blocks: list[Block] = Field(default_factory=list)
    links: list[Link] = Field(default_factory=list)

    @property
    def snapshot_url(self) -> str:
        """Where the bytes at `sha256` came from."""
        return self.source_url or self.url

    def evidence(self, block: Block) -> Evidence:
        return Evidence(
            url=self.snapshot_url,
            sha256=self.sha256,
            locator=block.locator,
            text=block.text,
        )
