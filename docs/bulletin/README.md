# Bulletin development and recovery

Ingestion and agent interpretation are development activities. The production API
must read a validated, edition-scoped academic database through deterministic
queries. No request handler should import the ingestion package or fetch Bulletin
pages. The current branch has no Bulletin production routes or published database;
extraction output alone is not a validated degree-audit engine.

## Reproduce the environment

Start from the GitHub checkpoint branch and read `AGENTS.md`, the repository
`README.md`, and `docs/bulletin/progress.md`. Do not assume Mac files, credentials,
running containers, virtual environments, or databases exist in a new checkout.

Tested toolchain: Node 24.21.0, pnpm 12.14.0 (pinned in `package.json`), uv 0.13.0,
Python 3.14.8, Docker 29.8.2, PostgreSQL 18.6. The host's default Python 3.15.0 is
not the ingestion runtime. `compression.zstd` requires Python 3.14 or newer.
Install these tools using the host's approved provisioning mechanism, then:

```sh
node --version
pnpm --version
uv --version
docker version
uv python install 3.14.8
pnpm install --frozen-lockfile --ignore-scripts
cd apps/api
uv sync --locked --python 3.14.8
uv run --frozen python --version
uv run --frozen pytest tests/unit/bulletin
uv run --frozen ruff check app/modules/bulletin tests/unit/bulletin
```

JavaScript lifecycle scripts are unnecessary for the Python ingestion tests.
Dependency locks are committed; do not regenerate them just to bootstrap a host.
No application `.env` or production credentials are needed for this workflow.

For disposable PostgreSQL tests only, from the repository root:

```sh
docker compose -f docs/bulletin/compose.test.yaml up -d --wait
docker compose -f docs/bulletin/compose.test.yaml exec -T postgres postgres --version
docker compose -f docs/bulletin/compose.test.yaml exec -T postgres psql -U bulletin_test -d bulletin_test -c 'SELECT version();'
# Run integration tests with an explicit localhost:55432/bulletin_test DSN.
docker compose -f docs/bulletin/compose.test.yaml down
```

This separate Compose project uses tmpfs and loopback port 55432. Do not use the
application's default Compose database for disposable tests. Do not run the old
loader: it inherits application database URLs and can replace an edition.

## GitHub persistence

The user approved GitHub on 2026-10-24. `VJL0/betterssb` is public. Store source and
small progress metadata in Git, and large public Bulletin snapshots as release
assets. Keep releases as drafts while validating a checkpoint. Draft assets need
authenticated GitHub access; a fresh cloud host needs its own authorized access.
Never include `.env`, credentials, student audits, or the entire ignored `data/`
tree. `data/catalog` contains student audit context mixed with academic data.

From `apps/api`, after stopping ingestion writers:

```sh
export ENVIRONMENT=development
export BULLETIN_DATA_DIR=/absolute/path/to/bulletin
uv run --frozen python -m app.modules.bulletin.ingest checkpoint --output /absolute/path/outside-source/checkpoint
uv run --frozen python -m app.modules.bulletin.ingest verify-checkpoint /absolute/path/outside-source/checkpoint
```

A checkpoint uses SQLite's backup API, copies all content-addressed objects
(including superseded snapshots), preserves extracted/manifests/reports trees,
and validates file checksums, SQLite integrity and source-object references.
It refuses to overwrite an existing destination and publishes the directory only
after verification succeeds. Stop writers first: SQLite backup is consistent, but
mutable JSONL files cannot be snapshotted transactionally alongside it.

Download the release asset and its SHA-256 file using `gh release download` with
the tag in the ledger. Verify the archive checksum before extraction into a new
empty directory. Run `verify-checkpoint` before pointing `BULLETIN_DATA_DIR` at the
restored directory. A restored checkpoint is a working copy; the GitHub asset is
the persistent copy. Use a new release/tag for subsequent checkpoints, never
replace the last known good asset.

`status` reads the existing URL state; `fetch --dry-run` previews remaining work.
Do not use `--refresh` by default. Existing extraction summaries have no input
fingerprint/review signature yet: retain them, and do not rerun `extract` simply
because a new environment started. Hash integrity does not establish semantic
correctness, completeness, or authority to publish academic rules.

## Sources and documentation checked

On 2026-10-24, HTTP access succeeded for the current
[undergraduate](https://bulletin.temple.edu/undergraduate/) and
[graduate/professional](https://bulletin.temple.edu/graduate/) Bulletin,
[Bulletin robots](https://bulletin.temple.edu/robots.txt),
[legacy robots](https://www.temple.edu/robots.txt), and a
[legacy graduate archive](https://www.temple.edu/gradarchives/13-14/).
The Bulletin robots file disallows `/archives/` and `/pdf/`; use retained captures
or provenance-recorded manual imports for those sources. Access must be rechecked
on the actual cloud host, including robots before automated crawling.

Implementation references verified accessible:
[uv locking](https://docs.astral.sh/uv/concepts/projects/sync/),
[pnpm install](https://pnpm.io/cli/install),
[SQLite backup](https://docs.python.org/3.14/library/sqlite3.html),
[Compose services](https://docs.docker.com/reference/compose-file/services/),
and [PostgreSQL backups](https://www.postgresql.org/docs/18/backup.html).

To verify existing extracts without repeating extraction:

```sh
# From apps/api, with ENVIRONMENT=development and BULLETIN_DATA_DIR set:
uv run --frozen python -m app.modules.bulletin.ingest validate-extracts
```

This checks the current typed record schemas, summary counts and URL/hash evidence
references. It reports per-file hashes; it does not validate academic semantics.
