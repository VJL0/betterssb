import sqlite3
from pathlib import Path

import pytest

from app.modules.bulletin.ingest.checkpoint import create_checkpoint, verify_checkpoint
from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.store import ObjectStore


def source_tree(root: Path) -> Path:
    source = root / "source"
    state = CrawlState(source / "crawl.sqlite3")
    state.close()
    ObjectStore(source / "objects").put(b"preserved source")
    extraction = source / "extracted" / "2026-2027"
    extraction.mkdir(parents=True)
    (extraction / "summary.json").write_text("{}")
    (source / ".env").write_text("private")
    return source


def test_checkpoint_round_trip_without_copying_unrelated_files(tmp_path):
    source = source_tree(tmp_path)
    destination = tmp_path / "checkpoint"
    create_checkpoint(source, destination)
    assert verify_checkpoint(destination)["file_count"] == 3
    assert not (destination / ".env").exists()
    with sqlite3.connect(destination / "crawl.sqlite3") as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    with pytest.raises(FileExistsError):
        create_checkpoint(source, destination)


def test_corruption_fails_verification(tmp_path):
    source = source_tree(tmp_path)
    destination = tmp_path / "checkpoint"
    create_checkpoint(source, destination)
    (destination / "extracted/2026-2027/summary.json").write_text("changed")
    with pytest.raises(ValueError, match="Checksum"):
        verify_checkpoint(destination)


def test_missing_source_does_not_create_empty_state(tmp_path):
    with pytest.raises(FileNotFoundError):
        create_checkpoint(tmp_path / "missing", tmp_path / "checkpoint")
    assert not (tmp_path / "checkpoint").exists()


def test_symlink_is_not_exported(tmp_path):
    source = source_tree(tmp_path)
    (source / "extracted/private").symlink_to(source / ".env")
    with pytest.raises(ValueError, match="Symlink"):
        create_checkpoint(source, tmp_path / "checkpoint")
    assert not (tmp_path / "checkpoint").exists()


def test_missing_referenced_object_prevents_checkpoint(tmp_path):
    source = source_tree(tmp_path)
    with sqlite3.connect(source / "crawl.sqlite3") as db:
        db.execute(
            "INSERT INTO fetches (url,requested_at,conditional,sha256) VALUES (?,?,?,?)",
            ("https://bulletin.temple.edu/", "today", 0, "a" * 64),
        )
    with pytest.raises(ValueError, match="Missing"):
        create_checkpoint(source, tmp_path / "checkpoint")


def test_destination_inside_source_is_rejected(tmp_path):
    source = source_tree(tmp_path)
    with pytest.raises(ValueError, match="outside"):
        create_checkpoint(source, source / "checkpoint")
