"""Offline, verifiable handoffs. Stop ingestion before taking a checkpoint.

Only the crawler store and its derived outputs are selected; older catalog
exports can contain private student audits and must be handled separately.
A checkpoint is transport-ready, not proof of academic validation or upload.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from app.modules.bulletin.ingest.store import ObjectStore

CHECKPOINT_VERSION = 1
MANIFEST_NAME = "checkpoint.json"
PAYLOAD_DIRECTORIES = ("objects", "extracted", "manifests", "reports")


def file_digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def payload_files(root: Path) -> list[Path]:
    result = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink cannot be checkpointed: {path.name}")
        if path.is_file() and path != root / MANIFEST_NAME:
            result.append(path)
    return result


def verify_objects(root: Path) -> None:
    store = ObjectStore(root / "objects")
    database = root / "crawl.sqlite3"
    with closing(
        sqlite3.connect(database.as_uri() + "?mode=ro&immutable=1", uri=True)
    ) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Crawl database integrity check failed")
        references = db.execute(
            "SELECT sha256 FROM urls WHERE sha256 IS NOT NULL "
            "UNION SELECT sha256 FROM fetches WHERE sha256 IS NOT NULL"
        ).fetchall()
    for (digest,) in references:
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("Invalid object reference")
        if not store.has(digest):
            raise ValueError(f"Missing source object: {digest}")
    for path in (root / "objects").rglob("*.zst"):
        if path != store.path(path.stem):
            raise ValueError(f"Invalid object path: {path.name}")
        store.get(path.stem)


def verify_checkpoint(directory: Path) -> dict[str, int]:
    root = directory.resolve()
    manifest = json.loads((root / MANIFEST_NAME).read_text())
    if manifest["version"] != CHECKPOINT_VERSION:
        raise ValueError("Unsupported checkpoint version")
    actual = {str(p.relative_to(root)): p for p in payload_files(root)}
    expected = manifest["files"]
    if set(actual) != set(expected):
        raise ValueError("Checkpoint file inventory differs")
    for name, path in actual.items():
        record = expected[name]
        if (
            path.stat().st_size != record["bytes"]
            or file_digest(path) != record["sha256"]
        ):
            raise ValueError(f"Checksum mismatch: {name}")
    verify_objects(root)
    return {
        "file_count": len(actual),
        "bytes": sum(p.stat().st_size for p in actual.values()),
    }


def create_checkpoint(source: Path, destination: Path) -> dict[str, int]:
    source, destination = source.resolve(), destination.resolve()
    if destination == source or source in destination.parents:
        raise ValueError("Checkpoint destination must be outside the source directory")
    if destination.exists():
        raise FileExistsError(destination)
    database = source / "crawl.sqlite3"
    if not database.is_file():
        raise FileNotFoundError(database)
    if database.is_symlink():
        raise ValueError("Symlink database cannot be checkpointed")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".bulletin-checkpoint-", dir=destination.parent
    ) as temporary:
        staging = Path(temporary) / "payload"
        staging.mkdir()
        with (
            closing(
                sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
            ) as original,
            closing(sqlite3.connect(staging / "crawl.sqlite3")) as backup,
        ):
            original.backup(backup)
            backup.execute("PRAGMA journal_mode=DELETE")
        for name in PAYLOAD_DIRECTORIES:
            directory = source / name
            if directory.is_symlink():
                raise ValueError(f"Symlink cannot be checkpointed: {name}")
            if directory.exists():
                payload_files(directory)
                shutil.copytree(directory, staging / name)
        manifest = {
            "version": CHECKPOINT_VERSION,
            "created_at": datetime.now(UTC).isoformat(),
            "academic_validation": "not_asserted",
            "files": {
                str(path.relative_to(staging)): {
                    "sha256": file_digest(path),
                    "bytes": path.stat().st_size,
                }
                for path in payload_files(staging)
            },
        }
        (staging / MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n"
        )
        result = verify_checkpoint(staging)
        staging.rename(destination)
    return result
