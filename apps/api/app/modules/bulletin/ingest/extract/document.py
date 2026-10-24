"""A page's readable structure: blocks in document order, each with a locator.

This is the layer every other extractor and every citation rests on. A block
is the smallest unit a person would quote: a heading, a paragraph, a list item,
a definition, a table, a course entry. Its XPath and source line point back
into the exact snapshot bytes, so a stored fact can always be re-checked.

CourseLeaf pages keep their content in `#contentarea`, split into tab panels
(`div.tab_content`, e.g. `requirementstextcontainer`); legacy pages have no
such regions, so their whole body is read.
"""

from __future__ import annotations

import re

from lxml import etree, html

from app.modules.bulletin.ingest.records import (
    Block,
    BlockKind,
    Crumb,
    Link,
    Locator,
    PageDocument,
    Tab,
)
from app.modules.bulletin.ingest.urls import normalize_url

CONTENT_XPATHS = ('//*[@id="contentarea"]', "//body")
EDITION_LABEL = re.compile(r"(\d{4})\s*[-–]\s*(\d{4})")
HEADING_TAGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
LEAF_BLOCK_KINDS: dict[str, BlockKind] = {
    "p": "paragraph",
    "li": "list_item",
    "dt": "definition_term",
    "dd": "definition",
    "pre": "preformatted",
    "blockquote": "paragraph",
    "caption": "paragraph",
}
# Elements whose text is never part of a block's own text: they're blocks of
# their own, or containers of blocks.
BLOCK_LEVEL_TAGS = frozenset(
    {
        "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt",
        "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
        "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
        "table", "ul", "caption",
    }
)  # fmt: skip
SKIPPED_TAGS = frozenset(
    {"script", "style", "noscript", "button", "form", "nav", "iframe", "object"}
)
# CourseLeaf's screen-reader-only and print-only furniture.
SKIPPED_CLASSES = frozenset({"hidden", "noscript", "screen", "print-only"})
SKIPPED_IDS = frozenset({"print-dialog", "tabs", "cl-menu", "breadcrumb"})
WHITESPACE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    return WHITESPACE.sub(" ", text.replace("\xa0", " ")).strip()


def own_text(element: html.HtmlElement) -> str:
    """The element's text without the text of block-level descendants."""
    parts = [element.text or ""]
    for child in element:
        if (
            isinstance(child.tag, str)
            and child.tag not in BLOCK_LEVEL_TAGS
            and child.tag not in SKIPPED_TAGS
            and not _is_skipped(child)
        ):
            parts.append(own_text(child))
        parts.append(child.tail or "")
    return clean_text("".join(parts))


def table_text(table: html.HtmlElement) -> str:
    """A table as lines of cells, ` | `-separated; hidden header rows dropped."""
    lines = []
    for row in table.iter("tr"):
        if _is_skipped(row):
            continue
        cells = [clean_text(cell.text_content()) for cell in row if _is_cell(cell)]
        if any(cells):
            lines.append(" | ".join(cells))
    return "\n".join(lines)


def _is_cell(element: html.HtmlElement) -> bool:
    return isinstance(element.tag, str) and element.tag in {"td", "th"}


def _classes(element: html.HtmlElement) -> set[str]:
    return set((element.get("class") or "").split())


def _is_skipped(element: html.HtmlElement) -> bool:
    return bool(_classes(element) & SKIPPED_CLASSES) or (
        element.get("id") in SKIPPED_IDS
    )


class _Walker:
    def __init__(self, tree: etree._ElementTree) -> None:
        self.tree = tree
        self.blocks: list[Block] = []
        self.headings: list[tuple[int, str]] = []
        self.tab: str | None = None

    def emit(
        self,
        element: html.HtmlElement,
        kind: BlockKind,
        text: str,
        level: int | None = None,
    ) -> None:
        if not text:
            return
        self.blocks.append(
            Block(
                index=len(self.blocks),
                kind=kind,
                text=text,
                level=level,
                section=[heading for _, heading in self.headings],
                locator=Locator(
                    xpath=self.tree.getpath(element),
                    line=element.sourceline,
                    tab=self.tab,
                ),
            )
        )

    def walk(self, element: html.HtmlElement) -> None:
        if (
            element.text
            and element.text.strip()
            and element.tag
            not in {
                "ul",
                "ol",
                "dl",
                "table",
                "tr",
            }
        ):
            self._loose_text(element)
        for child in element:
            if isinstance(child.tag, str):
                self.visit(child)

    def _loose_text(self, element: html.HtmlElement) -> None:
        """Text sitting directly in a container (`div.courseblockheaddiv`)."""
        self.emit(element, "text", own_text(element))

    def visit(self, element: html.HtmlElement) -> None:
        tag = element.tag
        if tag in SKIPPED_TAGS or _is_skipped(element):
            return
        if tag == "div" and "tab_content" in _classes(element):
            self.tab, self.headings = element.get("id"), []
            self.walk(element)
            self.tab, self.headings = None, []
            return
        if tag == "table":
            self.emit(element, "table", table_text(element))
            return
        if tag == "div" and "courseblock" in _classes(element):
            self.emit(element, "course_block", clean_text(element.text_content()))
            return
        if tag in HEADING_TAGS:
            level = HEADING_TAGS[tag]
            text = clean_text(element.text_content())
            self.headings = [(lvl, h) for lvl, h in self.headings if lvl < level]
            self.emit(element, "heading", text, level)
            if text:
                self.headings.append((level, text))
            return
        if tag in LEAF_BLOCK_KINDS:
            self.emit(element, LEAF_BLOCK_KINDS[tag], own_text(element))
            for child in element:
                if isinstance(child.tag, str) and child.tag in BLOCK_LEVEL_TAGS:
                    self.visit(child)
            return
        self.walk(element)


def edition_label(document: html.HtmlElement) -> str | None:
    for xpath in ('//*[@id="edition"]', '//*[@id="site-title"]'):
        for element in document.xpath(xpath):
            if match := EDITION_LABEL.search(element.text_content()):
                return f"{match[1]}-{match[2]}"
    return None


def _breadcrumbs(document: html.HtmlElement, base: str) -> list[Crumb]:
    crumbs = []
    for item in document.xpath('//*[@id="breadcrumb"]//li'):
        anchors = item.xpath(".//a[@href]")
        url = normalize_url(anchors[0].get("href"), base) if anchors else None
        if text := clean_text(item.text_content()).strip("›» "):
            crumbs.append(Crumb(text=text, url=url))
    return crumbs


def _tabs(document: html.HtmlElement) -> list[Tab]:
    return [
        Tab(id=anchor.get("aria-controls"), label=clean_text(anchor.text_content()))
        for anchor in document.xpath('//*[@id="tabs"]//a[@aria-controls]')
    ]


def _heading(document: html.HtmlElement, crumbs: list[Crumb], title: str) -> str:
    for xpath in ('//*[@id="contentarea"]//h1', "//h1[contains(@class,'page-title')]"):
        if found := document.xpath(xpath):
            return clean_text(found[0].text_content())
    if crumbs:
        return crumbs[-1].text
    return title.split("|")[0].strip()


def _links(root: html.HtmlElement, base: str, blocks: list[Block], tree) -> list[Link]:
    block_by_xpath = {block.locator.xpath: block.index for block in blocks}
    links = []
    for anchor in root.xpath(".//a[@href]"):
        url = normalize_url(anchor.get("href"), base)
        if url is None:
            continue
        block_index = None
        for ancestor in anchor.iterancestors():
            if (index := block_by_xpath.get(tree.getpath(ancestor))) is not None:
                block_index = index
                break
        links.append(
            Link(
                url=url, text=clean_text(anchor.text_content()), block_index=block_index
            )
        )
    return links


def parse_html(body: bytes) -> html.HtmlElement:
    return html.document_fromstring(body)


def page_document(body: bytes, url: str, sha256: str) -> PageDocument:
    document = parse_html(body)
    tree = document.getroottree()
    title = clean_text(document.findtext(".//title") or "")
    crumbs = _breadcrumbs(document, url)
    root = next(
        (found[0] for xpath in CONTENT_XPATHS if (found := document.xpath(xpath))),
        document,
    )
    walker = _Walker(tree)
    walker.walk(root)
    return PageDocument(
        url=url,
        sha256=sha256,
        title=title,
        heading=_heading(document, crumbs, title),
        edition_label=edition_label(document),
        breadcrumbs=crumbs,
        tabs=_tabs(document),
        blocks=walker.blocks,
        links=_links(root, url, walker.blocks, tree),
    )
