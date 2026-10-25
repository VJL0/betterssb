"""Text helpers shared by the Bulletin page, course list and course description parsers."""

from __future__ import annotations

import re

from bs4 import Comment, NavigableString, Tag

BULLETIN_BASE = "https://bulletin.temple.edu"
BULLETIN_HOST = "bulletin.temple.edu"
COURSE_CODE_RE = re.compile(r"([A-Z]{2,5})\s+(\d{3,5}[A-Z]?)")
# Elements whose content starts on a new line.
_LINE_BLOCKS = frozenset({"p", "div", "li", "dd", "dt", "h1", "h2", "h3", "h4", "h5"})


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ").replace("\u200b", "")).strip()


def full_url(href: str) -> str:
    if not href:
        return ""
    return href if href.startswith(("http", "mailto:")) else f"{BULLETIN_BASE}{href}"


def lines(
    el: Tag | None, *, skip: frozenset[str] = frozenset(), skip_sup: bool = False
) -> list[str]:
    """The element's text split at <br> and block elements, without empty lines.

    `skip` leaves out whole child elements by tag name (nested lists, tables);
    `skip_sup` leaves out footnote markers.
    """
    if el is None:
        return []
    found: list[str] = []
    current: list[str] = []

    def flush() -> None:
        text = clean("".join(current))
        if text:
            found.append(text)
        current.clear()

    def visit(node: Tag) -> None:
        for child in node.children:
            if isinstance(child, Comment):
                continue
            if isinstance(child, NavigableString):
                current.append(str(child))
            elif child.name == "br":
                flush()
            elif child.name in skip or (skip_sup and child.name == "sup"):
                continue
            elif child.name in _LINE_BLOCKS:
                flush()
                visit(child)
                flush()
            else:
                visit(child)

    visit(el)
    flush()
    return found


def text(
    el: Tag | None, *, skip: frozenset[str] = frozenset(), skip_sup: bool = False
) -> str:
    return " ".join(lines(el, skip=skip, skip_sup=skip_sup))


def footnote_map(dl: Tag | None) -> dict[str, str]:
    """Footnote number to text from a CourseLeaf footnote list (dl.sc_footnotes)."""
    if dl is None:
        return {}
    notes: dict[str, str] = {}
    for dt in dl.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        number = clean(dt.get_text())
        if number and dd is not None:
            notes[number] = text(dd)
    return notes


def course_codes(el: Tag | None) -> list[str]:
    """Course codes linked in an element (CourseLeaf's bubble links), in order."""
    if el is None:
        return []
    codes = [clean(a.get("title") or a.get_text()) for a in el.select("a.bubblelink")]
    return list(dict.fromkeys(c for c in codes if c))
