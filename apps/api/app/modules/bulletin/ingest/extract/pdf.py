"""CourseLeaf's PDF printouts, read deterministically with page and bbox evidence.

Every Bulletin page has a PDF twin (`…/<slug>/<slug>.pdf`), and the full
volumes (`/pdf/*.pdf`) are the only copy of some editions. CourseLeaf prints
them from the same content, in Helvetica: 8 pt body, bold 8 pt course titles,
part labels and table area headers, 11-22 pt headings, 6.4 pt superscript
footnote markers, and a running header above y = 54 (page title and number).

Text comes from pdfplumber's characters (its native text layer; no OCR or
layout model). Lines are pdfplumber's text lines; words are split here so that
superscripts, bold runs and font sizes stay separate. Requirement tables are
rebuilt from word positions under each "Code Title Credit Hours" header,
because pdfplumber's ruling-based table finder misses most rows of these
borderless tables. Rows are kept as printed (`TableRow`, like the HTML
extractor's), so interpret/requirements.py reads either source the same way.

Coordinates are pdfplumber's: points from the page's top-left corner, so a
locator's bbox is (x0, top, x1, bottom) and `page` is 1-based.
"""

from __future__ import annotations

import io
import re
from collections import Counter
from collections.abc import Iterable, Iterator
from contextlib import ExitStack
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import pdfplumber
from pydantic import BaseModel

from app.modules.bulletin.ingest.captures import PDF_CONTENT_TYPE
from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.extract.courses import (
    ATTRIBUTE_SEPARATOR,
    ATTRIBUTES_LABEL,
    COURSE_CODE,
    TITLE_LINE,
    CoursePart,
    CourseRecord,
    UnparsedCourseBlock,
    parse_credits,
)
from app.modules.bulletin.ingest.extract.document import EDITION_LABEL, clean_text
from app.modules.bulletin.ingest.extract.run import ExtractionIssue
from app.modules.bulletin.ingest.extract.tables import (
    CourseListTable,
    Footnote,
    RowKind,
    TableRow,
)
from app.modules.bulletin.ingest.records import (
    Block,
    BlockKind,
    Evidence,
    Link,
    Locator,
    PageDocument,
)
from app.modules.bulletin.ingest.store import ObjectStore

# The running header (page title, page number) sits above this line.
HEADER_BOTTOM = 54.0
# Below this share of the line's body size a character is a superscript.
SUPERSCRIPT_RATIO = 0.9
# Characters further apart than this share of the font size start a new word.
WORD_GAP_RATIO = 0.2
# A vertical gap above this many body-size multiples ends a paragraph.
PARAGRAPH_GAP_RATIO = 1.6
# Horizontal slack when comparing column and indentation positions.
POSITION_TOLERANCE = 2.0
# Table rows are ~13 pt apart; a wrapped title line is closer than this.
WRAPPED_LINE_GAP = 11.5
# Rows sit ~5 pt apart; more than this many body sizes separates two tables.
TABLE_GAP_RATIO = 1.5
INDENT_STEP = 10.0
BULLET = "•"
TABLE_HEADER = ("Code", "Title", "Credit")
# CourseLeaf's table total (`tr.listsum`); worded subtotals ("Total Credit
# Hours of Preclinical Coursework: 69") are ordinary rows.
TOTAL_ROW = "Total Credit Hours"
HOURS = re.compile(r"^(?:\d*\.)?\d+(?:-(?:\d*\.)?\d+)?$")
# Hours printed in words: "1 to 4", "6 TO 12", "0 or 3", "2 minimum".
HOURS_WORD = re.compile(r"^(?:to|TO|or|minimum)$")
# A plan grid starts "Year 1" then "Fall Credit Hours"; CourseLeaf prints plan
# grids under the same "Code Title Credit Hours" header as requirement tables,
# and some requirement tables (Podiatric Medicine) also group rows by year.
PLAN_YEAR = re.compile(r"^Year \d+$")
PLAN_TERM = re.compile(r"^(?:Fall|Spring|Summer)\b.*\bCredit Hours$")
FOOTNOTE_MARKER = re.compile(r"^(?:\d+|[*†‡§a-z])$")
# A subject ("CIS", "GUS/ENST") or a number ("1068", "M010", "3507/3597").
COURSE_NUMBER = r"(?:[0-9][0-9A-Z]{3,4}|[A-Z][0-9]{3,4})"
CODE_TOKEN = re.compile(
    rf"^(?:[A-Z]{{2,5}}(?:/[A-Z]{{2,5}})*|{COURSE_NUMBER}(?:/{COURSE_NUMBER})*)$"
)
NUMBER_TOKEN = re.compile(rf"^{COURSE_NUMBER}(?:/{COURSE_NUMBER})*$")
PART_LABEL = re.compile(r"^(?P<label>[A-Z][A-Za-z -]+):$")
COURSE_TITLE_START = re.compile(r"^[A-Z]{2,5} [0-9A-Z]{4,5}\.")
MAX_TITLE_LINES = 3
# A word, not a letter grade ("D-" / "or higher"), wrapped at a hyphen or slash.
WRAPPED_HYPHEN = re.compile(r"(?:[a-z]|[A-Z]{2,})[-/]$")
# Extractors of one document share a parse; a few documents is enough.
PARSE_CACHE_SIZE = 4


@dataclass(slots=True)
class Word:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    size: float
    bold: bool
    italic: bool
    superscript: bool = False


@dataclass(slots=True)
class Line:
    page: int
    words: list[Word]
    size: float
    top: float = field(init=False)
    bottom: float = field(init=False)
    x0: float = field(init=False)
    x1: float = field(init=False)

    def __post_init__(self) -> None:
        self.top = min(w.top for w in self.words)
        self.bottom = max(w.bottom for w in self.words)
        self.x0 = min(w.x0 for w in self.words)
        self.x1 = max(w.x1 for w in self.words)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def body_words(self) -> list[Word]:
        return [w for w in self.words if not w.superscript]

    @property
    def body_text(self) -> str:
        return " ".join(w.text for w in self.body_words)

    @property
    def bold(self) -> bool:
        return all(w.bold for w in self.body_words)

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return (
            round(self.x0, 2),
            round(self.top, 2),
            round(self.x1, 2),
            round(self.bottom, 2),
        )

    @property
    def is_running_header(self) -> bool:
        return self.bottom <= HEADER_BOTTOM

    def bold_prefix(self) -> str:
        words = []
        for word in self.body_words:
            if not word.bold:
                break
            words.append(word.text)
        return " ".join(words)


def _words(chars: list[dict], body_size: float) -> list[Word]:
    words: list[Word] = []
    current: list[dict] = []

    def flush() -> None:
        if current:
            first = current[0]
            words.append(
                Word(
                    text="".join(c["text"] for c in current),
                    x0=first["x0"],
                    x1=current[-1]["x1"],
                    top=min(c["top"] for c in current),
                    bottom=max(c["bottom"] for c in current),
                    size=first["size"],
                    bold="Bold" in first["fontname"],
                    italic="Oblique" in first["fontname"]
                    or "Italic" in first["fontname"],
                    superscript=first["size"] < body_size * SUPERSCRIPT_RATIO,
                )
            )
            current.clear()

    for char in sorted(chars, key=lambda c: c["x0"]):
        if char["text"].isspace():
            flush()
            continue
        if current:
            previous = current[-1]
            gap = char["x0"] - previous["x1"]
            if (
                gap > char["size"] * WORD_GAP_RATIO
                or char["size"] != previous["size"]
                or char["fontname"] != previous["fontname"]
            ):
                flush()
        current.append(char)
    flush()
    return words


@dataclass(frozen=True, slots=True)
class PdfText:
    """One parse of a PDF: its lines, body font size and links."""

    lines: list[Line]
    body_size: float
    links: list[Link]


def _page_links(page) -> list[Link]:
    links = []
    for link in page.hyperlinks:
        if not link.get("uri"):
            continue
        box = _clamped((link["x0"], link["top"], link["x1"], link["bottom"]), page)
        words = page.within_bbox(box).extract_text() or ""
        links.append(Link(url=link["uri"], text=clean_text(words)))
    return links


@lru_cache(maxsize=PARSE_CACHE_SIZE)
def read_pdf(body: bytes) -> PdfText:
    """Every text line in reading order, the body font size, and the links.

    Cached on the bytes, so a document's extractors share one parse."""
    lines: list[Line] = []
    links: list[Link] = []
    with pdfplumber.open(io.BytesIO(body)) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            for text_line in page.extract_text_lines(return_chars=True, strip=False):
                chars = text_line["chars"]
                visible = [c for c in chars if not c["text"].isspace()]
                if not visible:
                    continue
                sizes = Counter(round(c["size"], 1) for c in visible)
                size = sizes.most_common(1)[0][0]
                lines.append(Line(page=number, words=_words(chars, size), size=size))
            links.extend(_page_links(page))
            # Full volumes run to thousands of pages; keep only what was read.
            page.close()
    text_by_size: Counter[float] = Counter()
    for line in lines:
        text_by_size[line.size] += len(line.text)
    body_size = text_by_size.most_common(1)[0][0] if text_by_size else 0.0
    return PdfText(lines=lines, body_size=body_size, links=links)


def _locator(lines: list[Line]) -> Locator:
    """The first page's lines' bounding box; a passage that continues onto
    the next page is located by where it starts."""
    first = [line for line in lines if line.page == lines[0].page]
    return Locator(
        page=lines[0].page,
        bbox=(
            round(min(line.x0 for line in first), 2),
            round(min(line.top for line in first), 2),
            round(max(line.x1 for line in first), 2),
            round(max(line.bottom for line in first), 2),
        ),
    )


def _evidence(url: str, sha256: str, lines: list[Line], text: str) -> Evidence:
    return Evidence(url=url, sha256=sha256, locator=_locator(lines), text=text)


def _join(lines: Iterable[Line]) -> str:
    """Lines as one passage. A line ending in a hyphen or slash after a letter
    wraps a compound ("African-" / "centered", "and/" / "or"), so no space is
    added; CourseLeaf doesn't hyphenate words itself."""
    text = ""
    for line in lines:
        piece = line.text
        text += piece if not text or WRAPPED_HYPHEN.search(text) else f" {piece}"
    return clean_text(text)


# Document structure


def _heading_levels(lines: list[Line], body_size: float) -> dict[float, int]:
    sizes = sorted({line.size for line in lines if line.size > body_size}, reverse=True)
    return {size: level for level, size in enumerate(sizes, start=1)}


def _block_kind(line: Line, levels: dict[float, int]) -> BlockKind:
    if line.is_running_header:
        return "text"
    if line.size in levels:
        return "heading"
    if line.text.startswith(BULLET):
        return "list_item"
    return "paragraph"


def _continues(previous: Line, line: Line, body_size: float, kind: BlockKind) -> bool:
    """Whether `line` carries on the block `previous` ends."""
    if kind == "text" or line.page != previous.page or line.size != previous.size:
        return False
    if line.text.startswith(BULLET) or line.is_running_header:
        return False
    if line.top - previous.bottom > body_size * (PARAGRAPH_GAP_RATIO - 1):
        return False
    # A bold run starting a line (a course title, a part label) starts a block.
    return not (line.body_words and line.body_words[0].bold and not previous.bold)


def _grouped(lines: list[Line], body_size: float, levels: dict[float, int]):
    group: list[Line] = []
    kind: BlockKind = "paragraph"
    for line in lines:
        line_kind = _block_kind(line, levels)
        if group and (
            line_kind != kind
            and line_kind != "paragraph"
            or not _continues(group[-1], line, body_size, kind)
        ):
            yield kind, group
            group = []
        if not group:
            kind = line_kind
        group.append(line)
    if group:
        yield kind, group


def pdf_document(body: bytes, url: str, sha256: str) -> PageDocument:
    """The PDF's readable structure: every line in a block, in reading order."""
    parsed = read_pdf(body)
    lines, body_size = parsed.lines, parsed.body_size
    levels = _heading_levels(lines, body_size)
    blocks: list[Block] = []
    headings: list[tuple[int, str]] = []
    for kind, group in _grouped(lines, body_size, levels):
        text = _join(group)
        level = levels.get(group[0].size) if kind == "heading" else None
        if level is not None:
            headings = [(lvl, txt) for lvl, txt in headings if lvl < level]
        blocks.append(
            Block(
                index=len(blocks),
                kind=kind,
                text=text,
                level=level,
                section=[txt for _, txt in headings],
                locator=_locator(group),
            )
        )
        if level is not None:
            headings.append((level, text))
    title = next((b.text for b in blocks if b.kind == "heading" and b.level == 1), "")
    edition = EDITION_LABEL.search(url)
    return PageDocument(
        url=url,
        sha256=sha256,
        title=title,
        heading=title,
        edition_label=f"{edition[1]}-{edition[2]}" if edition else None,
        blocks=blocks,
        links=parsed.links,
    )


def _clamped(
    box: tuple[float, float, float, float], page
) -> tuple[float, float, float, float]:
    x0, top, x1, bottom = box
    return (max(x0, 0), max(top, 0), min(x1, page.width), min(bottom, page.height))


# Course listings


def _content(lines: list[Line]) -> list[Line]:
    return [line for line in lines if not line.is_running_header]


def _title_at(lines: list[Line], start: int) -> tuple[re.Match[str], int] | None:
    """The course title line starting at `start` (bold, possibly wrapped)."""
    if not (lines[start].bold and COURSE_TITLE_START.match(lines[start].body_text)):
        return None
    for count in range(1, MAX_TITLE_LINES + 1):
        chunk = lines[start : start + count]
        if len(chunk) < count or not all(line.bold for line in chunk):
            return None
        if match := TITLE_LINE.match(clean_text(" ".join(l.body_text for l in chunk))):
            return match, count
    return None


def _starts_part(line: Line) -> str | None:
    prefix = line.bold_prefix()
    label = PART_LABEL.match(prefix)
    return label["label"] if label else None


def pdf_courses(
    body: bytes, url: str, sha256: str
) -> tuple[list[CourseRecord], list[UnparsedCourseBlock]]:
    lines = _content(read_pdf(body).lines)
    courses: list[CourseRecord] = []
    unparsed: list[UnparsedCourseBlock] = []
    starts = [i for i in range(len(lines)) if _title_at(lines, i)]
    # Bold lines that look like a title but don't parse are reported, not dropped.
    for index, line in enumerate(lines):
        if (
            line.bold
            and COURSE_TITLE_START.match(line.body_text)
            and index not in starts
        ) and not any(s < index < s + MAX_TITLE_LINES for s in starts):
            unparsed.append(
                UnparsedCourseBlock(
                    reason=f"title line not understood: {line.text!r}",
                    evidence=_evidence(url, sha256, [line], line.text),
                )
            )
    for number, start in enumerate(starts):
        end = starts[number + 1] if number + 1 < len(starts) else len(lines)
        courses.append(_course(lines[start:end], url, sha256))
    return courses, unparsed


def _course(lines: list[Line], url: str, sha256: str) -> CourseRecord:
    match, title_lines = _title_at(lines, 0)  # type: ignore[misc]
    description: list[Line] = []
    parts: list[tuple[str, list[Line]]] = []
    for line in lines[title_lines:]:
        label = _starts_part(line)
        if label:
            parts.append((label, [line]))
        elif parts:
            parts[-1][1].append(line)
        else:
            description.append(line)
    course_parts = []
    for label, part_lines in parts:
        text = _join(part_lines)
        value = text[len(label) + 1 :].strip()
        course_parts.append(
            CoursePart(
                label=label,
                text=value,
                evidence=_evidence(url, sha256, part_lines, text),
            )
        )
    attributes = next((p for p in course_parts if p.label == ATTRIBUTES_LABEL), None)
    description_text = _join(description)
    code = f"{match['subject']} {match['number']}"
    all_text = " ".join([description_text, *(p.text for p in course_parts)])
    return CourseRecord(
        subject=match["subject"],
        number=match["number"],
        title=match["title"].strip().rstrip("."),
        credits=parse_credits(match["credits"]),
        description=description_text,
        parts=course_parts,
        attributes=[a for a in ATTRIBUTE_SEPARATOR.split(attributes.text) if a]
        if attributes
        else [],
        referenced_courses=[
            c
            for c in dict.fromkeys(f"{s} {n}" for s, n in COURSE_CODE.findall(all_text))
            if c != code
        ],
        evidence=_evidence(url, sha256, lines, _join(lines)),
    )


# Requirement tables


@dataclass(slots=True)
class _Columns:
    code_x: float
    title_x: float
    hours_x: float
    # Hours are right-aligned under "Credit Hours".
    hours_right: float


def _table_header(line: Line, next_line: Line | None) -> _Columns | None:
    words = line.body_words
    texts = [w.text for w in words]
    if texts[:3] != list(TABLE_HEADER) or not line.bold:
        return None
    return _Columns(
        code_x=words[0].x0,
        title_x=words[1].x0,
        hours_x=words[2].x0,
        hours_right=words[2].x1,
    )


def _is_orphan_marker(line: Line, body_size: float) -> bool:
    return line.size < body_size * SUPERSCRIPT_RATIO and all(
        FOOTNOTE_MARKER.match(word.text) for word in line.words
    )


def _starts_plan_grid(lines: list[Line], position: int) -> bool:
    line = lines[position]
    following = lines[position + 1] if position + 1 < len(lines) else None
    return (
        line.bold
        and PLAN_YEAR.match(line.body_text) is not None
        and following is not None
        and PLAN_TERM.match(following.body_text) is not None
    )


def _is_wrapped_hours(line: Line, previous: Line | None, columns: _Columns) -> bool:
    words = line.body_words
    return (
        previous is not None
        and line.page == previous.page
        and line.top - previous.top < WRAPPED_LINE_GAP
        and bool(words)
        and all(_in_hours_column(w, columns) for w in words)
        and all(HOURS.match(w.text) or HOURS_WORD.match(w.text) for w in words)
    )


def _row_ends_table(line: Line, columns: _Columns, body_size: float) -> bool:
    if line.size != body_size:
        return True
    if line.words[0].superscript or line.text.startswith(BULLET):
        return True
    return line.x0 < columns.code_x - POSITION_TOLERANCE / 2


def _in_hours_column(word: Word, columns: _Columns) -> bool:
    return (
        word.x0 >= columns.hours_x - POSITION_TOLERANCE
        or word.x1 >= columns.hours_right - POSITION_TOLERANCE
    )


def _split_row(
    line: Line, columns: _Columns
) -> tuple[list[str], list[str], list[str], list[str]]:
    """Code tokens, title words, hours tokens and footnote markers."""
    words = line.body_words
    footnotes = [w.text for w in line.words if w.superscript]
    hours: list[str] = []
    while (
        words and _in_hours_column(words[-1], columns) and HOURS.match(words[-1].text)
    ):
        hours.insert(0, words.pop().text)
        # "1 to 4" is right-aligned as one value: take its words with it.
        while (
            len(words) >= 2
            and HOURS_WORD.match(words[-1].text)
            and HOURS.match(words[-2].text)
            and hours[0][0].isdigit()
        ):
            hours[:0] = [words[-2].text, words[-1].text]
            del words[-2:]
    # "2 minimum": a value followed by a word.
    if (
        len(words) >= 2
        and HOURS_WORD.match(words[-1].text)
        and _in_hours_column(words[-1], columns)
        and HOURS.match(words[-2].text)
    ):
        hours[:0] = [words[-2].text, words[-1].text]
        del words[-2:]
    code: list[str] = []
    rest = list(words)
    while rest and (
        CODE_TOKEN.match(rest[0].text)
        or rest[0].text in {"&", "or"}
        and code
        or rest[0].text == "or"
    ):
        if rest[0].x0 >= columns.title_x - POSITION_TOLERANCE and code:
            break
        code.append(rest.pop(0).text)
    # A trailing joiner or a lone subject belongs to the title ("or Higher").
    while code and (code[-1] in {"&", "or"} or not NUMBER_TOKEN.match(code[-1])):
        rest.insert(0, _stub(code.pop()))
    return code, [w.text for w in rest], hours, footnotes


def _stub(text: str) -> Word:
    return Word(
        text=text, x0=0, x1=0, top=0, bottom=0, size=0, bold=False, italic=False
    )


def _codes(tokens: list[str]) -> tuple[list[str], str | None]:
    codes: list[str] = []
    subject = ""
    for token in tokens:
        if re.fullmatch(r"[A-Z]{2,5}(?:/[A-Z]{2,5})*", token):
            subject = token
        elif subject and NUMBER_TOKEN.match(token):
            codes.append(f"{subject} {token}")
    joiner = None
    if len(codes) > 1:
        joiner = "and" if "&" in tokens else "or" if "or" in tokens[1:] else None
    return list(dict.fromkeys(codes)), joiner


def _row(line: Line, index: int, columns: _Columns) -> TableRow:
    code, title_words, hours, footnotes = _split_row(line, columns)
    title = clean_text(" ".join(title_words))
    courses, joiner = _codes(code)
    kind: RowKind
    if not code and title == TOTAL_ROW:
        kind = "total"
    elif courses and code[0] == "or":
        kind = "alternative"
    elif courses:
        kind = "course"
    elif line.bold:
        kind = "area_header"
    else:
        kind = "comment"
    indent = max(0, round((line.x0 - columns.code_x) / INDENT_STEP))
    if kind == "alternative":
        indent = max(0, indent - 1)
    comment = (
        clean_text(" ".join(code + title_words))
        if kind in {"comment", "area_header", "total"}
        else ""
    )
    return TableRow(
        index=index,
        kind=kind,
        courses=courses,
        joiner=joiner,
        code_text=" ".join(code),
        title=title if kind in {"course", "alternative"} else "",
        hours=" ".join(hours),
        comment=comment,
        indent=indent,
        footnotes=footnotes,
        classes=[],
        locator=Locator(page=line.page, bbox=line.bbox),
    )


def _extend(row: TableRow, line: Line) -> TableRow:
    """A wrapped title or comment line joins the row above it."""
    text = line.body_text
    update = {
        "footnotes": [*row.footnotes, *(w.text for w in line.words if w.superscript)]
    }
    if row.kind in {"course", "alternative"}:
        update["title"] = clean_text(f"{row.title} {text}")
    else:
        update["comment"] = clean_text(f"{row.comment} {text}")
    return row.model_copy(update=update)


def _is_pair_continuation(row: TableRow, line: Line) -> bool:
    """ "& CHEM 1033 and General Chemistry Laboratory I": the second half of a
    lecture-lab pair, which the HTML prints in the row above's code cell."""
    words = line.body_words
    return (
        row.kind in {"course", "alternative"} and bool(words) and words[0].text == "&"
    )


def _pair(row: TableRow, line: Line, columns: _Columns) -> TableRow:
    shifted = Line(page=line.page, words=line.words[1:], size=line.size)
    code, title_words, hours, footnotes = _split_row(shifted, columns)
    courses, _ = _codes(code)
    return row.model_copy(
        update={
            "courses": list(dict.fromkeys([*row.courses, *courses])),
            "joiner": "and",
            "code_text": f"{row.code_text} & {' '.join(code)}",
            "title": clean_text(f"{row.title} {' '.join(title_words)}"),
            "hours": row.hours or " ".join(hours),
            "footnotes": [*row.footnotes, *footnotes],
        }
    )


def _footnotes(lines: Iterator[Line], url: str, sha256: str) -> list[Footnote]:
    footnotes: list[tuple[str, list[Line]]] = []
    for line in lines:
        if line.words[0].superscript:
            footnotes.append((line.words[0].text, [line]))
        elif footnotes and not line.bold and line.x0 > footnotes[-1][1][0].x0:
            footnotes[-1][1].append(line)
        else:
            break
    result = []
    for marker, group in footnotes:
        text = clean_text(" ".join(line.text for line in group)[len(marker) :])
        courses = list(dict.fromkeys(f"{s} {n}" for s, n in COURSE_CODE.findall(text)))
        result.append(
            Footnote(
                marker=marker,
                text=text,
                courses=courses,
                evidence=_evidence(url, sha256, group, text),
            )
        )
    return result


def pdf_requirement_tables(body: bytes, url: str, sha256: str) -> list[CourseListTable]:
    """Requirement tables, row by row as printed, with their footnotes."""
    parsed = read_pdf(body)
    lines, body_size = parsed.lines, parsed.body_size
    levels = _heading_levels(lines, body_size)
    content = _content(lines)
    tables: list[CourseListTable] = []
    headings: list[tuple[int, str]] = []
    position = 0
    while position < len(content):
        line = content[position]
        if line.size in levels:
            level = levels[line.size]
            headings = [h for h in headings if h[0] < level] + [(level, line.text)]
        following = content[position + 1] if position + 1 < len(content) else None
        columns = _table_header(line, following)
        if columns is None:
            position += 1
            continue
        position += 1
        # The header's second line ("Hours", right-aligned under "Credit").
        if following is not None and following.body_text == "Hours":
            position += 1
        rows: list[TableRow] = []
        row_lines: list[Line] = [line]
        previous: Line | None = None
        while position < len(content):
            row_line = content[position]
            if rows and _is_orphan_marker(row_line, body_size):
                # A footnote marker that wrapped below its row's title.
                markers = [w.text for w in row_line.words]
                rows[-1] = rows[-1].model_copy(
                    update={"footnotes": [*rows[-1].footnotes, *markers]}
                )
                row_lines.append(row_line)
                previous = row_line
                position += 1
                continue
            if rows and _is_wrapped_hours(row_line, previous, columns):
                # "6 TO" / "12": the hours cell wrapped onto its own line.
                hours = f"{rows[-1].hours} {row_line.body_text}".strip()
                rows[-1] = rows[-1].model_copy(update={"hours": hours})
                row_lines.append(row_line)
                previous = row_line
                position += 1
                continue
            if _row_ends_table(row_line, columns, body_size):
                break
            # A table without a header right below this one ("(F) - Fall
            # only course") is printed after a gap wider than any row's.
            if (
                previous is not None
                and row_line.page == previous.page
                and row_line.top - previous.bottom > body_size * TABLE_GAP_RATIO
            ):
                break
            wrapped = (
                previous is not None
                and rows
                and row_line.page == previous.page
                and row_line.top - previous.top < WRAPPED_LINE_GAP
                and row_line.x0 >= columns.title_x - POSITION_TOLERANCE
                and not _codes(_split_row(row_line, columns)[0])[0]
            )
            if rows and _is_pair_continuation(rows[-1], row_line):
                rows[-1] = _pair(rows[-1], row_line, columns)
            elif wrapped:
                rows[-1] = _extend(rows[-1], row_line)
            elif _starts_plan_grid(content, position):
                # The plan grid isn't a requirement table; its lines stay in
                # `pdf_document`.
                break
            else:
                rows.append(_row(row_line, len(rows), columns))
            row_lines.append(row_line)
            previous = row_line
            position += 1
            if rows[-1].kind == "total":
                break
        footnotes = _footnotes(iter(content[position:]), url, sha256)
        tables.append(
            CourseListTable(
                index=len(tables),
                rows=rows,
                footnotes=footnotes,
                section=[text for _, text in headings],
                tab=None,
                evidence=_evidence(url, sha256, row_lines, _join(row_lines)[:500]),
            )
        )
    return tables


def pdf_requirement_rows(body: bytes, url: str, sha256: str) -> list[TableRow]:
    """Every requirement-table row in the document, in order."""
    return [
        row for table in pdf_requirement_tables(body, url, sha256) for row in table.rows
    ]


# Agreement with the HTML twin

COURSE_FIELDS = ("title", "credits", "description", "prerequisites")
NORMALIZED_PUNCTUATION = str.maketrans(
    {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-"}
)
SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([,.;:)\]])")
SPACE_AFTER_BRACKET = re.compile(r"([(\[])\s+")


def normalized(text: str) -> str:
    """Text as compared across formats: PDF line breaks and typography aside."""
    text = text.replace("&amp;", "&").translate(NORMALIZED_PUNCTUATION)
    text = SPACE_AFTER_BRACKET.sub(
        r"\1", SPACE_BEFORE_PUNCTUATION.sub(r"\1", clean_text(text))
    )
    return text.casefold()


@dataclass(slots=True)
class Agreement:
    """How a PDF's extraction compares with its HTML twin's."""

    courses_html: int = 0
    courses_pdf: int = 0
    courses_matched: int = 0
    # field -> [exact matches, normalized matches] over matched courses
    fields: dict[str, list[int]] = field(
        default_factory=lambda: {name: [0, 0] for name in COURSE_FIELDS}
    )
    field_mismatches: list[tuple[str, str, str, str]] = field(default_factory=list)
    tables_html: int = 0
    tables_pdf: int = 0
    rows_html: int = 0
    rows_pdf: int = 0
    rows_matched: int = 0
    row_mismatches: list[tuple[str, str, str]] = field(default_factory=list)


def _course_fields(course: CourseRecord) -> dict[str, str]:
    prerequisites = course.part("Pre-requisites")
    return {
        "title": course.title,
        "credits": course.credits.text,
        "description": course.description,
        "prerequisites": prerequisites.text if prerequisites else "",
    }


def _row_keys(rows: Iterable[TableRow]) -> Counter[tuple[tuple[str, ...], str]]:
    return Counter(
        (tuple(row.courses), row.hours) for row in rows if row.courses or row.hours
    )


def compare_with_html(
    pdf_body: bytes,
    pdf_url: str,
    pdf_sha256: str,
    html_body: bytes,
    html_url: str,
    html_sha256: str,
) -> Agreement:
    # Imported here: the HTML extractors aren't needed to read PDFs.
    from app.modules.bulletin.ingest.extract.courses import parse_course_listing
    from app.modules.bulletin.ingest.extract.document import page_document, parse_html
    from app.modules.bulletin.ingest.extract.programs import parse_program_page

    agreement = Agreement()
    document = parse_html(html_body)
    html_courses = {
        c.code: c for c in parse_course_listing(document, html_url, html_sha256)[0]
    }
    pdf_courses_by_code = {
        c.code: c for c in pdf_courses(pdf_body, pdf_url, pdf_sha256)[0]
    }
    agreement.courses_html = len(html_courses)
    agreement.courses_pdf = len(pdf_courses_by_code)
    for code in html_courses.keys() & pdf_courses_by_code.keys():
        agreement.courses_matched += 1
        html_fields = _course_fields(html_courses[code])
        pdf_fields = _course_fields(pdf_courses_by_code[code])
        for name in COURSE_FIELDS:
            exact = html_fields[name] == pdf_fields[name]
            close = normalized(html_fields[name]) == normalized(pdf_fields[name])
            agreement.fields[name][0] += exact
            agreement.fields[name][1] += close
            if not close:
                agreement.field_mismatches.append(
                    (code, name, html_fields[name], pdf_fields[name])
                )
    if html_courses:
        return agreement
    program = parse_program_page(
        document, page_document(html_body, html_url, html_sha256)
    )
    html_rows = _row_keys(row for table in program.tables for row in table.rows)
    pdf_tables = pdf_requirement_tables(pdf_body, pdf_url, pdf_sha256)
    pdf_rows = _row_keys(row for table in pdf_tables for row in table.rows)
    agreement.tables_html = len(program.tables)
    agreement.tables_pdf = len(pdf_tables)
    agreement.rows_html = sum(html_rows.values())
    agreement.rows_pdf = sum(pdf_rows.values())
    agreement.rows_matched = sum((html_rows & pdf_rows).values())
    for key, count in (html_rows - pdf_rows).items():
        agreement.row_mismatches.append(
            ("html_only", " / ".join(key[0]), f"{key[1]} ×{count}")
        )
    for key, count in (pdf_rows - html_rows).items():
        agreement.row_mismatches.append(
            ("pdf_only", " / ".join(key[0]), f"{key[1]} ×{count}")
        )
    return agreement


PDF_OUTPUTS = ("documents", "courses", "tables", "issues")


def extract_edition_pdfs(
    state: CrawlState, store: ObjectStore, edition: str, directory: Path
) -> dict[str, int]:
    """Parse every stored PDF of an edition into `<directory>/*.jsonl`.

    A PDF that can't be read becomes an issue rather than stopping the run, so
    one damaged download doesn't hide the rest of a volume.
    """
    rows = [
        row
        for row in state.fetched(edition)
        if (row["content_type"] or "").startswith(PDF_CONTENT_TYPE)
    ]
    directory.mkdir(parents=True, exist_ok=True)
    counts: Counter[str] = Counter()
    with ExitStack() as stack:
        files = {
            name: stack.enter_context((directory / f"{name}.jsonl").open("w"))
            for name in PDF_OUTPUTS
        }

        def write(name: str, records: Iterable[BaseModel]) -> None:
            for record in records:
                files[name].write(record.model_dump_json() + "\n")
                counts[name] += 1

        for row in rows:
            url, sha256 = row["url"], row["sha256"]
            body = store.get(sha256)
            try:
                document = pdf_document(body, url, sha256)
                courses, unparsed = pdf_courses(body, url, sha256)
                tables = pdf_requirement_tables(body, url, sha256)
            # pdfminer raises many unrelated types for malformed files.
            except Exception as error:  # noqa: BLE001
                write(
                    "issues",
                    [
                        ExtractionIssue(
                            code="pdf_unreadable",
                            severity="error",
                            url=url,
                            detail=repr(error),
                        )
                    ],
                )
                continue
            write("documents", [document])
            write("courses", courses)
            write("tables", tables)
            write(
                "issues",
                (
                    ExtractionIssue(
                        code="course_block_unparsed",
                        severity="error",
                        url=url,
                        detail=u.reason,
                    )
                    for u in unparsed
                ),
            )
    return {"pdfs": len(rows), **{name: counts[name] for name in PDF_OUTPUTS}}
