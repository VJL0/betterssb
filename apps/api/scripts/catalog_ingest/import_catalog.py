# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.26,<2", "psycopg[binary]>=3.2,<4"]
# ///
"""Archive a complete bulletin and build an evidence-backed PostgreSQL graph.

uv run import_catalog.py extract --pdf bulletin.pdf --output data/catalog
uv run import_catalog.py load --input data/catalog

DATABASE_URL or DATABASE_URL_UNPOOLED supplies the PostgreSQL connection.
Document content is data, never code, SQL, or model instructions.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pymupdf

EXTRACTOR_VERSION = "1.0.0"
SCHEMA_VERSION = 1
COURSE_REF = re.compile(
    r"\b(?P<subject>[A-Z][A-Z&]{1,7})\s+(?P<number>\d{4}[A-Z]?)(?![\dA-Z])"
)
COURSE_HEADER = re.compile(
    r"(?P<subject>[A-Z][A-Z&]{1,7}) (?P<number>\d{4}[A-Z]?)\.\s+"
    r"(?P<title>.+?)\.\s+(?P<minimum>\d+(?:\.\d+)?)"
    r"(?:\s+(?P<credit_operator>to|or|-)\s+(?P<maximum>\d+(?:\.\d+)?))? Credit Hours?\."
)
RULE_LABELS = {
    "Pre-requisites": "prerequisite",
    "Co-requisites": "corequisite",
    "Course Attributes": "attributes",
    "Repeatability": "repeatability",
    "Registration Restrictions": "registration_restriction",
    "Field of Study Restrictions": "field_of_study_restriction",
    "Class Restrictions": "class_restriction",
    "Level Restrictions": "level_restriction",
    "College Restrictions": "college_restriction",
    "Cohort Restrictions": "cohort_restriction",
    "Department Restrictions": "department_restriction",
    "Degree Restrictions": "degree_restriction",
    "Student Attribute Restrictions": "student_attribute_restriction",
    "Level Registration Restrictions": "level_registration_restriction",
    "Prerequisites": "prerequisite",
    "NOTE": "note",
    "Note": "note",
    "DUPLICATE CREDIT WARNING": "duplicate_credit_warning",
    "Duplicate Course": "duplicate_course_note",
}
RULE_PATTERN = re.compile(r"(?m)^(?:" + "|".join(map(re.escape, RULE_LABELS)) + r"):")
HEADER_MARGIN = 50
FOOTER_MARGIN = 25
PROGRESS_INTERVAL = 100
MINIMUM_TEXT_LENGTH = 40
MINIMUM_HEADING_FONT_SIZE = 10
TABLE_MINIMUM_VERTICAL_WORDS = 3
TABLE_MINIMUM_HORIZONTAL_WORDS = 1
MAXIMUM_COURSE_HEADER_LINES = 4
PROGRAM_CODE = re.compile(r"Program Code:\s*([A-Z0-9-]+)")
EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
PRINTED_REFERENCE = re.compile(r"\(p\.\s*(\d+)\)")


def course_references(text: str) -> Iterator[dict]:
    for match in COURSE_REF.finditer(text):
        yield {
            "code": f"{match['subject']} {match['number']}",
            "start": match.start(),
            "end": match.end(),
        }


def rule_fields(text: str) -> list[dict]:
    matches = list(RULE_PATTERN.finditer(text))
    return [
        {
            "kind": RULE_LABELS[match.group()[:-1]],
            "text": text[
                match.start() : matches[i + 1].start()
                if i + 1 < len(matches)
                else len(text)
            ].strip(),
            "executable": False,
        }
        for i, match in enumerate(matches)
    ]


def json_nodes(
    value: Any, pointer: str = "", parent: str | None = None
) -> Iterator[dict]:
    kind = (
        "object"
        if isinstance(value, dict)
        else "array"
        if isinstance(value, list)
        else "scalar"
    )
    yield {
        "pointer": pointer,
        "parent": parent,
        "type": kind,
        "value": value if kind == "scalar" else None,
        "length": len(value) if kind != "scalar" else None,
    }
    items = (
        value.items()
        if isinstance(value, dict)
        else enumerate(value)
        if isinstance(value, list)
        else []
    )
    for key, child in items:
        escaped = str(key).replace("~", "~0").replace("/", "~1")
        yield from json_nodes(child, f"{pointer}/{escaped}", pointer)


def context_warnings(context: dict, catalog_year: str) -> list[str]:
    year = str(context.get("source", {}).get("catalog_year", ""))
    if year and catalog_year.split("-")[0] not in year:
        return [
            (
                f"Audit catalog year {year!r} differs from bulletin {catalog_year}; "
                "course links are lexical matches, not proof that newer requirements apply."
            )
        ]
    return []


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def safe_json(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode()}
    if isinstance(value, dict):
        return {str(k): safe_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_json(v) for v in value]
    if isinstance(value, (pymupdf.Rect, pymupdf.Point, pymupdf.Matrix)):
        return list(value)
    return value


class Archive:
    def __init__(self, directory: Path):
        self.directory = directory
        self.records = (directory / "records.jsonl").open("w", encoding="utf-8")
        self.edges = (directory / "edges.jsonl").open("w", encoding="utf-8")
        self.counts: Counter = Counter()
        self.courses: set[str] = set()

    def record(
        self,
        key: str,
        kind: str,
        text: str = "",
        page: int | None = None,
        attributes: dict | None = None,
    ):
        row = {
            "key": key,
            "kind": kind,
            "page": page,
            "text": text,
            "attributes": attributes or {},
        }
        self.records.write(json.dumps(safe_json(row), ensure_ascii=False) + "\n")
        self.counts[kind] += 1

    def edge(
        self, source: str, target: str, relation: str, evidence: dict | None = None
    ):
        row = {
            "source": source,
            "target": target,
            "relation": relation,
            "evidence": evidence or {},
        }
        self.edges.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.counts["edges"] += 1

    def course(self, code: str) -> str:
        key = "course:" + code
        if code not in self.courses:
            self.courses.add(code)
            self.record(
                key,
                "course",
                code,
                attributes={
                    "code": code,
                    "defined_in_bulletin": "see course_definition edges",
                },
            )
        return key

    def mentions(self, key: str, text: str, page: int | None):
        for reference in course_references(text):
            self.edge(
                key,
                self.course(reference["code"]),
                "mentions_course",
                {
                    "page": page,
                    **reference,
                    "meaning": "lexical mention; not unconditional eligibility",
                },
            )

    def close(self):
        self.records.close()
        self.edges.close()


def extract_sections(document: pymupdf.Document, archive: Archive) -> list[dict]:
    toc = document.get_toc(simple=False)
    sections = []
    stack: list[dict] = []
    for index, entry in enumerate(toc):
        level, title, start, destination = entry
        # A bookmark's next sibling/ancestor bounds its page range, not its next child.
        end = next(
            (row[2] for row in toc[index + 1 :] if row[0] <= level), len(document)
        )
        valid_start = 1 <= start <= len(document)
        section = {
            "key": f"section:{index}",
            "level": level,
            "title": title,
            "start": start,
            "end": min(end, len(document)),
        }
        while stack and stack[-1]["level"] >= level:
            stack.pop()
        archive.record(
            section["key"],
            "section",
            title,
            start if valid_start else None,
            {
                **section,
                "destination": destination,
                "range_precision": "page_overlap",
                "program_candidate": bool(
                    re.search(r"\b(BA|BS|BFA|BBA|BM|Minor|Certificate)\b", title)
                ),
            },
        )
        archive.edge(
            stack[-1]["key"] if stack else "document",
            section["key"],
            "contains_section",
        )
        stack.append(section)
        if valid_start:
            sections.append(section)
    return sections


def page_payload(page: pymupdf.Page, tables: bool) -> dict:
    layout = page.get_text(
        "dict", flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES
    )
    payload = {
        "label": page.get_label(),
        "width": page.rect.width,
        "height": page.rect.height,
        "rotation": page.rotation,
        "mediabox": list(page.mediabox),
        "cropbox": list(page.cropbox),
        "layout": layout,
        "links": page.get_links(),
        "annotations": [],
        "widgets": [],
        "images": page.get_image_info(xrefs=True),
        "fonts": page.get_fonts(full=True),
        "tables": [],
    }
    for annotation in page.annots() or []:
        payload["annotations"].append(
            {
                "type": annotation.type,
                "info": annotation.info,
                "rect": list(annotation.rect),
                "vertices": annotation.vertices,
                "colors": annotation.colors,
                "flags": annotation.flags,
            }
        )
    for widget in page.widgets() or []:
        payload["widgets"].append(
            {
                "name": widget.field_name,
                "value": widget.field_value,
                "type": widget.field_type_string,
                "rect": list(widget.rect),
            }
        )
    if tables:
        # CourseLeaf uses shaded rows and whitespace rather than a complete grid.
        finder = page.find_tables(
            strategy="text",
            min_words_vertical=TABLE_MINIMUM_VERTICAL_WORDS,
            min_words_horizontal=TABLE_MINIMUM_HORIZONTAL_WORDS,
        )
        for table in finder.tables:
            payload["tables"].append(
                {
                    "bbox": list(table.bbox),
                    "cells": table.cells,
                    "rows": table.extract(),
                    "header": table.header.names,
                    "method": "pymupdf_text_geometry",
                    "requires_review": True,
                }
            )
    return safe_json(payload)


def body_lines(payload: dict) -> list[str]:
    lines = []
    for block in payload["layout"]["blocks"]:
        for line in block.get("lines", []):
            if (
                line["bbox"][1] >= HEADER_MARGIN
                and line["bbox"][3] <= payload["height"] - FOOTER_MARGIN
            ):
                lines.append("".join(span["text"] for span in line["spans"]))
    return lines


def course_header_starts(payload: dict) -> set[str]:
    starts = set()
    for block in payload["layout"]["blocks"]:
        for line in block.get("lines", []):
            spans = [span for span in line["spans"] if span["text"].strip()]
            text = "".join(span["text"] for span in line["spans"])
            if (
                spans
                and "Bold" in spans[0].get("font", "")
                and re.match(r"^[A-Z][A-Z&]{1,7} \d{4}[A-Z]?\. ", text)
            ):
                starts.add(text)
    return starts


def joined_course_lines(
    lines: list[str], heading_starts: set[str] | None = None
) -> Iterator[str]:
    """Join a wrapped heading only when the complete credit-bearing header matches."""
    index = 0
    while index < len(lines):
        line = lines[index]
        if re.match(r"^[A-Z][A-Z&]{1,7} \d{4}[A-Z]?\. ", line) and (
            heading_starts is None or line in heading_starts
        ):
            candidate = line
            for lookahead in range(
                index, min(index + MAXIMUM_COURSE_HEADER_LINES, len(lines))
            ):
                if lookahead > index:
                    if re.match(r"^[A-Z][A-Z&]{1,7} \d{4}[A-Z]?\. ", lines[lookahead]):
                        break
                    candidate += " " + lines[lookahead]
                if COURSE_HEADER.fullmatch(candidate.strip()):
                    line = candidate
                    index = lookahead
                    break
        yield line
        index += 1


def advance_courses(
    archive: Archive,
    pending: dict | None,
    lines: list[str],
    number: int,
    section_titles: set[str],
    heading_starts: set[str] | None = None,
) -> dict | None:
    for line in joined_course_lines(lines, heading_starts):
        header = COURSE_HEADER.fullmatch(line.strip())
        if (
            header
            and heading_starts is not None
            and not any(line.startswith(start) for start in heading_starts)
        ):
            header = None
        if header:
            save_course(archive, pending)
            fields = header.groupdict()
            pending = {
                "code": f"{fields['subject']} {fields['number']}",
                "title": fields["title"],
                "credit_minimum": float(fields["minimum"]),
                "credit_maximum": float(fields["maximum"] or fields["minimum"]),
                "credit_model": "discrete_options"
                if fields["credit_operator"] == "or"
                else "range"
                if fields["maximum"]
                else "fixed",
                "credit_options": [float(fields["minimum"]), float(fields["maximum"])]
                if fields["credit_operator"] == "or"
                else None,
                "credit_header": header.group(),
                "start": number,
                "pages": [number],
                "lines": [line],
            }
        elif line.strip() in section_titles:
            save_course(archive, pending)
            pending = None
        elif pending:
            pending["lines"].append(line)
            if pending["pages"][-1] != number:
                pending["pages"].append(number)
    return pending


def save_course(archive: Archive, pending: dict | None):
    if not pending:
        return
    text = "\n".join(pending["lines"])
    key = f"definition:{pending['code']}:{pending['start']}"
    archive.record(
        key,
        "course_definition",
        text,
        pending["start"],
        {k: v for k, v in pending.items() if k != "lines"},
    )
    archive.edge(archive.course(pending["code"]), key, "has_definition")
    for page_number in sorted(set(pending["pages"])):
        archive.edge(key, f"page:{page_number}", "evidenced_on")
    archive.mentions(key, text, pending["start"])
    for index, rule in enumerate(rule_fields(text)):
        rule_key = f"{key}:rule:{index}"
        archive.record(rule_key, "course_rule", rule["text"], pending["start"], rule)
        archive.edge(key, rule_key, "has_rule")
        for reference in course_references(rule["text"]):
            archive.edge(
                rule_key,
                archive.course(reference["code"]),
                f"{rule['kind']}_mentions",
                {
                    **reference,
                    "executable": False,
                    "page_span": sorted(set(pending["pages"])),
                    "qualifiers": "Read the complete rule text, including AND/OR, grades, tests, ranges and concurrency.",
                },
            )


def extract_context(path: Path, archive: Archive, catalog_year: str) -> list[str]:
    context = json.loads(path.read_text(encoding="utf-8"))
    archive.record(
        "audit",
        "audit_context",
        attributes={
            "raw": context,
            "sha256": digest(path),
            "source": context.get("source"),
            "separate_catalog_version": True,
        },
    )
    courses = {row["id"]: row for row in context.get("courses", [])}
    for node in json_nodes(context):
        pointer = node["pointer"]
        key = "audit:" + pointer
        archive.record(
            key,
            "audit_node",
            str(node["value"]) if node["type"] == "scalar" else "",
            attributes=node,
        )
        archive.edge(
            "audit" if node["parent"] is None else "audit:" + node["parent"],
            key,
            "contains_json_value",
        )
        if node["type"] == "scalar" and isinstance(node["value"], str):
            archive.mentions(key, node["value"], None)
        if re.search(r"/course_ids/\d+$", pointer) and node["value"] in courses:
            course_index = next(
                i
                for i, row in enumerate(context["courses"])
                if row["id"] == node["value"]
            )
            archive.edge(
                key,
                f"audit:/courses/{course_index}",
                "source_displayed_membership",
                {"does_not_prove_double_counting": True},
            )
    return context_warnings(context, catalog_year)


def extract(args: argparse.Namespace):
    if args.output.exists():
        raise ValueError(
            f"Output already exists: {args.output}; choose a new directory."
        )
    args.output.mkdir(parents=True)
    archive = Archive(args.output)
    warnings = []
    document_hash = digest(args.pdf)
    # Original bytes retain figures, vector art, hidden text, attachments and PDF objects.
    shutil.copyfile(args.pdf, args.output / "source.pdf")
    try:
        with pymupdf.open(args.pdf) as document:
            if document.needs_pass:
                raise ValueError(
                    "Encrypted PDF needs a password; extraction has not completed."
                )
            archive.record(
                "document",
                "document",
                attributes={
                    "metadata": document.metadata,
                    "page_count": len(document),
                    "sha256": document_hash,
                    "page_labels": document.get_page_labels(),
                    "xml_metadata": document.get_xml_metadata(),
                    "extractor_version": EXTRACTOR_VERSION,
                    "catalog_year": args.catalog_year,
                },
            )
            sections = extract_sections(document, archive)
            section_titles = {section["title"] for section in sections}
            printed_pages: dict[int, int] = {}
            pending = None
            for index, page in enumerate(document):
                number = index + 1
                text = page.get_text(sort=False)
                payload = page_payload(page, not args.skip_tables)
                archive.record(f"page:{number}", "page", text, number, payload)
                archive.edge("document", f"page:{number}", "contains_page")
                # Printed page numbers differ from physical PDF indices in this bulletin.
                top_lines = [
                    line
                    for block in payload["layout"]["blocks"]
                    for line in block.get("lines", [])
                    if line["bbox"][1] < HEADER_MARGIN
                ]
                for line in top_lines:
                    heading = "".join(span["text"] for span in line["spans"]).strip()
                    match = re.search(r"^(\d+)\s+|\s+(\d+)$", heading)
                    if match:
                        printed_pages[int(match.group(1) or match.group(2))] = number
                if len(text.strip()) < MINIMUM_TEXT_LENGTH:
                    warnings.append(
                        f"Page {number}: little embedded text; inspect source and consider OCR."
                    )
                for section in sections:
                    if section["start"] <= number <= section["end"]:
                        archive.edge(
                            section["key"],
                            f"page:{number}",
                            "overlaps_page",
                            {"precision": "page_only"},
                        )
                extract_page_records(archive, number, text, payload)
                pending = advance_courses(
                    archive,
                    pending,
                    body_lines(payload),
                    number,
                    section_titles,
                    course_header_starts(payload),
                )
                if number % PROGRESS_INTERVAL == 0:
                    print(
                        f"Extracted {number}/{len(document)} pages",
                        file=sys.stderr,
                        flush=True,
                    )
            save_course(archive, pending)
            extract_printed_references(archive, printed_pages, len(document))
            for name in document.embfile_names():
                archive.record(
                    "attachment:" + name,
                    "embedded_file",
                    attributes={
                        "name": name,
                        "info": document.embfile_info(name),
                        "bytes": document.embfile_get(name),
                    },
                )
            page_count = len(document)
        if args.context:
            shutil.copyfile(args.context, args.output / "context.json")
            warnings.extend(extract_context(args.context, archive, args.catalog_year))
    finally:
        archive.close()
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "extractor_version": EXTRACTOR_VERSION,
        "sha256": document_hash,
        "page_count": page_count,
        "catalog_year": args.catalog_year,
        "counts": dict(archive.counts),
        "warnings": warnings,
        "tables_extracted": not args.skip_tables,
        "recognized_rule_labels": RULE_LABELS,
        "parser_runtime": {"pymupdf": pymupdf.VersionBind},
        "limitations": [
            "Structured extraction is heuristic; the original PDF is the authoritative retained evidence.",
            "No exhaustive semantic interpretation or executable degree/prerequisite solver is claimed.",
            "Tables are geometry candidates and may split across pages or include non-table text.",
            "Section/page associations can overlap at section boundaries.",
            "Course mentions do not establish equivalence, credit applicability or permission.",
            "Images/figures are preserved in source.pdf; no OCR or visual semantic interpretation is performed.",
            "Course references spelled as names, slashes, abbreviated lists or ranges remain in raw text.",
        ],
    }
    for filename in ["source.pdf", "records.jsonl", "edges.jsonl", "context.json"]:
        path = args.output / filename
        if path.exists():
            manifest.setdefault("files", {})[filename] = digest(path)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


def extract_page_records(archive: Archive, number: int, text: str, payload: dict):
    page_key = f"page:{number}"
    for index, block in enumerate(payload["layout"]["blocks"]):
        block_text = "\n".join(
            "".join(span["text"] for span in line["spans"])
            for line in block.get("lines", [])
        )
        key = f"{page_key}:block:{index}"
        archive.record(
            key,
            "text_block",
            block_text,
            number,
            {"bbox": block["bbox"], "order": index},
        )
        archive.edge(page_key, key, "contains_block")
        archive.mentions(key, block_text, number)
        spans = [span for line in block.get("lines", []) for span in line["spans"]]
        if spans and any(
            "Bold" in span.get("font", "") and span["size"] >= MINIMUM_HEADING_FONT_SIZE
            for span in spans
        ):
            heading_key = key + ":heading"
            archive.record(
                heading_key,
                "heading_candidate",
                block_text,
                number,
                {"bbox": block["bbox"], "requires_review": True},
            )
            archive.edge(key, heading_key, "has_heading_candidate")
        labels = [
            label
            for label, pattern in {
                "grade_constraint": r"minimum grade|grade of at least|GPA",
                "credit_constraint": r"minimum.*credits|credit hours|s\.h\.",
                "exception_or_exclusion": r"except|cannot|may not|waiv|approval|permission",
                "choice_or_sequence": r"select|choose|either|concentration|semester|year [1-5]",
                "policy_or_requirement": r"must|required|requirement|policy",
            }.items()
            if re.search(pattern, block_text, re.IGNORECASE)
        ]
        if labels:
            archive.record(
                key + ":policy",
                "policy_candidate",
                block_text,
                number,
                {"labels": labels, "bbox": block["bbox"], "executable": False},
            )
            archive.edge(key, key + ":policy", "contains_policy_candidate")
        for program in PROGRAM_CODE.finditer(block_text):
            program_key = "program:" + program[1]
            # Occurrences are distinct; a program code is not assumed unique across versions.
            archive.record(
                f"{key}:{program_key}",
                "program_code",
                program[1],
                number,
                {"code": program[1], "source_text": block_text},
            )
            archive.edge(key, f"{key}:{program_key}", "declares_program_code")
        for email in sorted(set(EMAIL.findall(block_text))):
            archive.edge(key, "contact:" + email, "mentions_email")
            # Contact identity is only the literal email; names/roles remain in source text.
            archive.record(f"{key}:email:{email}", "contact_occurrence", email, number)
    for index, table in enumerate(payload["tables"]):
        key = f"{page_key}:table:{index}"
        table_text = "\n".join(
            "\t".join(cell or "" for cell in row) for row in table["rows"]
        )
        archive.record(key, "table", table_text, number, table)
        archive.edge(page_key, key, "contains_table_candidate")
        archive.mentions(key, table_text, number)
        for row_index, cells in enumerate(table["rows"]):
            row_key = f"{key}:row:{row_index}"
            row_text = "\t".join(cell or "" for cell in cells)
            archive.record(
                row_key,
                "table_row",
                row_text,
                number,
                {"cells": cells, "order": row_index, "requires_review": True},
            )
            archive.edge(key, row_key, "contains_row")
            archive.mentions(row_key, row_text, number)
            if row_index:
                archive.edge(f"{key}:row:{row_index - 1}", row_key, "next_row")
    for index, link in enumerate(payload["links"]):
        key = f"{page_key}:link:{index}"
        archive.record(key, "pdf_link", link.get("uri", ""), number, link)
        archive.edge(page_key, key, "contains_link")
        if isinstance(link.get("page"), int) and link["page"] >= 0:
            archive.edge(
                key,
                f"page:{link['page'] + 1}",
                "links_to_page",
                {"rect": link.get("from")},
            )
    # Store references for later resolution without assuming a fixed printed-page offset.
    for index, match in enumerate(PRINTED_REFERENCE.finditer(text)):
        archive.record(
            f"{page_key}:printed_ref:{index}",
            "printed_page_reference",
            match.group(),
            number,
            {"printed_page": int(match[1]), "start": match.start(), "end": match.end()},
        )


def extract_printed_references(
    archive: Archive, printed_pages: dict[int, int], count: int
):
    # Flush before a separate streaming pass reads records emitted above.
    archive.records.flush()
    contacts = set()
    with (archive.directory / "records.jsonl").open() as stream:
        for raw in stream:
            row = json.loads(raw)
            if row["kind"] == "printed_page_reference":
                target = printed_pages.get(row["attributes"]["printed_page"])
                if target and 1 <= target <= count:
                    archive.edge(
                        row["key"],
                        f"page:{target}",
                        "references_printed_page",
                        row["attributes"],
                    )
            elif row["kind"] == "contact_occurrence":
                contacts.add(row["text"])
    for email in sorted(contacts):
        archive.record("contact:" + email, "contact", email)


def verify(args: argparse.Namespace) -> dict:
    """Validate coverage and graph integrity independently of PostgreSQL."""
    manifest = json.loads((args.input / "manifest.json").read_text())
    required = {"source.pdf", "records.jsonl", "edges.jsonl"}
    if not required.issubset(manifest.get("files", {})):
        raise ValueError("Manifest is missing mandatory source checksums.")
    for filename, expected in manifest["files"].items():
        if Path(filename).name != filename or digest(args.input / filename) != expected:
            raise ValueError(f"Archive checksum/name failed: {filename}")
    if digest(args.input / "source.pdf") != manifest["sha256"]:
        raise ValueError("Document identity does not match original PDF bytes.")
    keys = set()
    pages = set()
    counts = Counter()
    candidates = set()
    definitions = set()
    non_definition_sentences = set()
    with (args.input / "records.jsonl").open() as stream:
        for raw in stream:
            row = json.loads(raw)
            if row["key"] in keys:
                raise ValueError(f"Duplicate record: {row['key']}")
            keys.add(row["key"])
            counts[row["kind"]] += 1
            if row["kind"] == "page":
                pages.add(row["page"])
                for line in joined_course_lines(
                    body_lines(row["attributes"]),
                    course_header_starts(row["attributes"]),
                ):
                    match = re.match(r"^([A-Z][A-Z&]{1,7}) (\d{4}[A-Z]?)\. ", line)
                    if match:
                        occurrence = (f"{match[1]} {match[2]}", row["page"])
                        if re.search(r"Credit Hours?\.", line):
                            candidates.add(occurrence)
                        else:
                            non_definition_sentences.add(occurrence)
            elif row["kind"] == "course_definition":
                definitions.add((row["attributes"]["code"], row["page"]))
    if pages != set(range(1, manifest["page_count"] + 1)):
        raise ValueError("Missing or unexpected source pages.")
    with (args.input / "edges.jsonl").open() as stream:
        for raw in stream:
            edge = json.loads(raw)
            if edge["source"] not in keys or edge["target"] not in keys:
                raise ValueError(
                    f"Dangling relationship: {edge['source']} -> {edge['target']}"
                )
            counts["edges"] += 1
    if dict(counts) != manifest["counts"]:
        raise ValueError("Archive record counts disagree with manifest.")
    report = {
        "checksums_valid": True,
        "all_pages_present": True,
        "unique_record_keys": True,
        "no_dangling_edges": True,
        "counts": dict(counts),
        "course_header_candidates": len(candidates),
        "unparsed_course_header_candidates": sorted(candidates - definitions),
        "non_definition_course_sentences": sorted(non_definition_sentences),
        "limitations": manifest["limitations"],
        "warnings": manifest["warnings"],
    }
    (args.input / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return report


def rebuild_courses(args: argparse.Namespace):
    """Rebuild derived course definitions/rules without repeating table detection."""
    manifest = json.loads((args.input / "manifest.json").read_text())
    for filename, expected in manifest["files"].items():
        if Path(filename).name != filename or digest(args.input / filename) != expected:
            raise ValueError("Archive checksum/name failed before course rebuild.")
    old_keys, codes, titles = set(), set(), set()
    with (args.input / "records.jsonl").open() as stream:
        for raw in stream:
            row = json.loads(raw)
            if row["kind"] in {"course_definition", "course_rule"}:
                old_keys.add(row["key"])
            elif row["kind"] == "course":
                codes.add(row["attributes"]["code"])
            elif row["kind"] == "section":
                titles.add(row["text"])
    with tempfile.TemporaryDirectory(dir=args.input) as directory:
        stage = Path(directory)
        archive = Archive(stage)
        archive.courses = codes
        pending = None
        try:
            with (args.input / "records.jsonl").open() as stream:
                for raw in stream:
                    row = json.loads(raw)
                    if row["key"] not in old_keys:
                        archive.records.write(raw)
                        archive.counts[row["kind"]] += 1
                    if row["kind"] == "page":
                        pending = advance_courses(
                            archive,
                            pending,
                            body_lines(row["attributes"]),
                            row["page"],
                            titles,
                            course_header_starts(row["attributes"]),
                        )
            save_course(archive, pending)
            with (args.input / "edges.jsonl").open() as stream:
                for raw in stream:
                    row = json.loads(raw)
                    if row["source"] not in old_keys and row["target"] not in old_keys:
                        archive.edges.write(raw)
                        archive.counts["edges"] += 1
        finally:
            archive.close()
        for filename in ["records.jsonl", "edges.jsonl"]:
            (stage / filename).replace(args.input / filename)
            manifest["files"][filename] = digest(args.input / filename)
        manifest["counts"] = dict(archive.counts)
        manifest["recognized_rule_labels"] = RULE_LABELS
        manifest["parser_runtime"] = {"pymupdf": pymupdf.VersionBind}
        (args.input / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    verify(args)


def load(args: argparse.Namespace):
    import psycopg
    from psycopg.types.json import Jsonb

    manifest = json.loads((args.input / "manifest.json").read_text())
    if manifest["schema_version"] != SCHEMA_VERSION:
        raise ValueError("Unsupported archive schema version.")
    if not {"source.pdf", "records.jsonl", "edges.jsonl"}.issubset(
        manifest.get("files", {})
    ):
        raise ValueError("Manifest is missing mandatory source checksums.")
    if digest(args.input / "source.pdf") != manifest["sha256"]:
        raise ValueError("Document identity does not match source PDF bytes.")
    for filename, expected in manifest["files"].items():
        if Path(filename).name != filename or digest(args.input / filename) != expected:
            raise ValueError(f"Archive checksum/name failed: {filename}")
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError("Set DATABASE_URL_UNPOOLED or DATABASE_URL.")
    url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    document_id = manifest["sha256"]
    ddl = Path(__file__).with_name("schema.sql").read_text()
    with psycopg.connect(url) as connection:
        connection.execute(ddl)
        # Serialize reruns of this document, then replace its derived records atomically.
        connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (document_id,)
        )
        existing = connection.execute(
            "SELECT 1 FROM catalog_ingest.documents WHERE id=%s", (document_id,)
        ).fetchone()
        if existing and not args.replace:
            raise ValueError(
                "Document already loaded; use --replace to atomically rebuild this document only."
            )
        connection.execute(
            "DELETE FROM catalog_ingest.documents WHERE id=%s", (document_id,)
        )
        connection.execute(
            "INSERT INTO catalog_ingest.documents(id, manifest, source_pdf, audit_context) VALUES (%s,%s,%s,%s)",
            (
                document_id,
                Jsonb(manifest),
                (args.input / "source.pdf").read_bytes(),
                Jsonb(json.loads((args.input / "context.json").read_text()))
                if (args.input / "context.json").exists()
                else None,
            ),
        )
        with (
            connection.cursor().copy(
                "COPY catalog_ingest.records(document_id,key,kind,page,text,attributes) FROM STDIN"
            ) as copy,
            (args.input / "records.jsonl").open() as stream,
        ):
            for raw in stream:
                row = json.loads(raw)
                copy.write_row(
                    (
                        document_id,
                        row["key"],
                        row["kind"],
                        row["page"],
                        row["text"],
                        Jsonb(row["attributes"]),
                    )
                )
        with (
            connection.cursor().copy(
                "COPY catalog_ingest.edges(document_id,source,target,relation,evidence) FROM STDIN"
            ) as copy,
            (args.input / "edges.jsonl").open() as stream,
        ):
            for raw in stream:
                row = json.loads(raw)
                copy.write_row(
                    (
                        document_id,
                        row["source"],
                        row["target"],
                        row["relation"],
                        Jsonb(row["evidence"]),
                    )
                )
        counts = dict(
            connection.execute(
                "SELECT kind,count(*) FROM catalog_ingest.records WHERE document_id=%s GROUP BY kind",
                (document_id,),
            ).fetchall()
        )
        expected_counts = {k: v for k, v in manifest["counts"].items() if k != "edges"}
        if counts != expected_counts:
            raise ValueError(f"Imported record counts disagree with manifest: {counts}")
        edge_count = connection.execute(
            "SELECT count(*) FROM catalog_ingest.edges WHERE document_id=%s",
            (document_id,),
        ).fetchone()[0]
        if edge_count != manifest["counts"]["edges"]:
            raise ValueError("Imported edge count disagrees with manifest.")
        connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
    print(
        json.dumps(
            {"loaded_document": document_id, "counts": counts, "edges": edge_count},
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    extraction = commands.add_parser(
        "extract", help="Local extraction; no network or database writes"
    )
    extraction.add_argument("--pdf", type=Path, required=True)
    extraction.add_argument("--context", type=Path)
    extraction.add_argument("--catalog-year", default="2026-2027")
    extraction.add_argument("--output", type=Path, required=True)
    extraction.add_argument(
        "--skip-tables",
        action="store_true",
        help="Omit geometry table candidates (recorded in manifest)",
    )
    verification = commands.add_parser(
        "verify",
        help="Check source hashes, page coverage, keys, relationships and course headers",
    )
    verification.add_argument("--input", type=Path, required=True)
    rebuilding = commands.add_parser(
        "rebuild-courses",
        help="Refresh structured courses/rules from retained page layouts",
    )
    rebuilding.add_argument("--input", type=Path, required=True)
    loading = commands.add_parser(
        "load", help="Load a verified archive into the catalog_ingest PostgreSQL schema"
    )
    loading.add_argument("--input", type=Path, required=True)
    loading.add_argument(
        "--replace",
        action="store_true",
        help="Replace only this exact PDF hash in one transaction",
    )
    args = parser.parse_args()
    try:
        {
            "extract": extract,
            "verify": verify,
            "rebuild-courses": rebuild_courses,
            "load": load,
        }[args.command](args)
    except Exception as error:
        # Avoid leaking credentials embedded in driver exception messages.
        print(
            f"{type(error).__name__}: operation failed. Inspect inputs, dependencies and database access.",
            file=sys.stderr,
        )
        if os.environ.get("CATALOG_DEBUG") == "1":
            raise
        sys.exit(1)


if __name__ == "__main__":
    main()
