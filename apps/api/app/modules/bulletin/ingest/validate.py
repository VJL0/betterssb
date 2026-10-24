"""Check retained typed extracts and provenance without scraping or interpreting."""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path

from pydantic import BaseModel

from app.modules.bulletin.ingest.checkpoint import file_digest
from app.modules.bulletin.ingest.extract.program_index import ProgramIndex
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.run import (
    CourseEntry,
    ExtractedPage,
    ExtractionIssue,
)

RECORD_MODELS: dict[str, type[BaseModel]] = {
    "pages": ExtractedPage,
    "courses": CourseEntry,
    "programs": ProgramPage,
    "issues": ExtractionIssue,
}


def evidence_references(value: object):
    if isinstance(value, dict):
        if "sha256" in value and "url" in value:
            yield value["url"], value["sha256"]
        for child in value.values():
            yield from evidence_references(child)
    elif isinstance(value, list):
        for child in value:
            yield from evidence_references(child)


def validate_extracts(root: Path) -> dict[str, object]:
    """Structural validation only; does not certify academic interpretation."""
    root = root.resolve()
    with closing(
        sqlite3.connect((root / "crawl.sqlite3").as_uri() + "?mode=ro", uri=True)
    ) as db:
        references = set(
            db.execute(
                "SELECT url,sha256 FROM urls WHERE sha256 IS NOT NULL "
                "UNION SELECT url,sha256 FROM fetches WHERE sha256 IS NOT NULL"
            )
        )
    editions = {}
    for directory in sorted((root / "extracted").iterdir()):
        if not directory.is_dir():
            continue
        summary = json.loads((directory / "summary.json").read_text())
        if summary["edition"] != directory.name:
            raise ValueError(f"Edition mismatch: {directory.name}")
        counts, hashes = {}, {}
        reference_count = 0
        for name, model in RECORD_MODELS.items():
            path = directory / f"{name}.jsonl"
            count = 0
            with path.open() as handle:
                for line in handle:
                    record = model.model_validate_json(line).model_dump(mode="json")
                    for reference in evidence_references(record):
                        if reference not in references:
                            raise ValueError(f"Unknown source evidence: {reference}")
                        reference_count += 1
                    count += 1
            if count != summary["counts"][name]:
                raise ValueError(f"Count mismatch: {directory.name}/{name}")
            counts[name] = count
            hashes[path.name] = file_digest(path)
        index_path = directory / "program_index.json"
        if index_path.exists():
            index = ProgramIndex.model_validate_json(index_path.read_text())
            for reference in evidence_references(index.model_dump(mode="json")):
                if reference not in references:
                    raise ValueError(f"Unknown source evidence: {reference}")
                reference_count += 1
            hashes[index_path.name] = file_digest(index_path)
        hashes["summary.json"] = file_digest(directory / "summary.json")
        editions[directory.name] = {
            "counts": counts,
            "evidence_references_checked": reference_count,
            "sha256": hashes,
        }
    return {"academic_validation": "not_asserted", "editions": editions}
