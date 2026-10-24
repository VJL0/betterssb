import json

import pytest

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.validate import evidence_references, validate_extracts


def test_nested_evidence_is_checked():
    assert list(
        evidence_references({"nested": [{"url": "source", "sha256": "hash"}]})
    ) == [("source", "hash")]


def test_retained_counts_are_checked_without_reextracting(tmp_path):
    state = CrawlState(tmp_path / "crawl.sqlite3")
    state.close()
    directory = tmp_path / "extracted" / "2026-2027"
    directory.mkdir(parents=True)
    counts = {name: 0 for name in ("pages", "courses", "programs", "issues")}
    for name in counts:
        (directory / f"{name}.jsonl").write_text("")
    summary = directory / "summary.json"
    summary.write_text(json.dumps({"edition": directory.name, "counts": counts}))
    assert validate_extracts(tmp_path)["editions"][directory.name]["counts"] == counts
    counts["courses"] = 1
    summary.write_text(json.dumps({"edition": directory.name, "counts": counts}))
    with pytest.raises(ValueError, match="Count mismatch"):
        validate_extracts(tmp_path)
