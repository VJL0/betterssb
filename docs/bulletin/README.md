# Bulletin ingestion, database and API

BetterSSB serves Temple's Bulletin (courses, programs and their requirement
trees, policies, academic units) from a versioned, edition-scoped Postgres schema
through read-only endpoints under `/api/bulletin`. An offline ingester builds
that data from stored snapshots of Temple's pages. Production never runs the
ingester, fetches Temple's site, or calls a model to answer a Bulletin request.

| Document | Contents |
| --- | --- |
| `progress.md` | Task ledger: verified state, measured results, remaining work, blockers |
| `editions.md` | Every known edition and what's retained, imported or blocked |
| `schema.md` | Tables, ER diagram, versioning, the requirement language, query paths |
| `technology.md` | Tool evaluation with versions, licenses and measurements |
| `report-20261024.json` | Coverage and quality report generated from the crawl state and database |
| `benchmark-20261024.json` | Query latencies and table sizes on the full import |
| `inventory/urls.csv.gz` | The full discovered URL manifest (every URL, its classification and outcome) |

## Pipeline

Code lives in `apps/api/app/modules/bulletin/`: `ingest/` is the offline tool,
`rules.py` the shared requirement language, and `models.py`, `repository.py`,
`router.py`, `schemas.py` the read side.

| Stage | Command | Network | Writes |
| --- | --- | --- | --- |
| Discover | `discover [--target current\|legacy\|all]` | Temple, robots-checked | crawl state, object store |
| Fetch | `fetch [--url …] [--refresh] [--dry-run]` | Temple, robots-checked | crawl state, object store |
| Manual sources | `import-capture <dir>`, `import-file <path> --url <official URL>` | — | crawl state, object store |
| Inventory | `manifest`, `status`, `relink` | — | `manifests/urls.{jsonl,csv}` |
| Extract | `extract --edition E` | — | `extracted/E/` (pages, courses, programs, program index, issues) |
| Extract PDFs | `extract-pdf --edition E` (needs `--group ingest`) | — | `extracted/E/pdf/` (documents, courses, requirement tables, issues) with page and bbox locators |
| Validate extracts | `validate-extracts` | — | report on stdout |
| Interpret | `interpret --edition E` | — | `interpreted/E/` (courses with requisites, programs with requirement trees and plans, units, policy sections, designations, issues, fingerprinted summary) |
| Import | `import --edition E --database-url URL [--publish] [--dry-run]` | Postgres | a staged batch (idempotent) |
| Publish / roll back | `publish BATCH --database-url URL [--dry-run]` | Postgres | the edition's release pointer |
| Prune | `prune BATCH --database-url URL` | Postgres | deletes an unpublished batch's rows; a once-released batch keeps its record as `pruned` |
| Report | `report --database-url URL [--output FILE]` | Postgres | coverage and quality JSON |
| Checkpoint | `checkpoint --output DIR`, `verify-checkpoint DIR` | — | a verified, portable copy of the data directory |

Run every command from `apps/api` as
`uv run --frozen python -m app.modules.bulletin.ingest <command>` with
`ENVIRONMENT=development` and `BULLETIN_DATA_DIR` set. The database URL is always
explicit; the ingester never reads the app's `DATABASE_URL`.

A full rebuild from retained snapshots, with no network, is:

```sh
for edition in 2026-2027 2024-2025; do
  uv run --frozen python -m app.modules.bulletin.ingest extract --edition $edition
  uv run --frozen python -m app.modules.bulletin.ingest interpret --edition $edition
done
uv run --frozen python -m app.modules.bulletin.ingest import \
  --edition 2026-2027 --edition 2024-2025 --database-url "$BULLETIN_DATABASE_URL"
uv run --frozen python -m app.modules.bulletin.ingest report --database-url "$BULLETIN_DATABASE_URL"
uv run --frozen python -m app.modules.bulletin.ingest publish <batch> --database-url "$BULLETIN_DATABASE_URL"
```

On 2026-10-24 extraction of both editions took 79 s, interpretation 19 s and the
import 16 s on a 4-vCPU cloud host. Extraction and interpretation are pure
functions of the snapshots; unchanged inputs give byte-identical files and the
same batch fingerprint.

### Updating an edition

Fetch with `--refresh` (conditional requests) or record new manual files, then
extract, interpret and import. Changed inputs produce a new batch; the old one
stays published until `publish` switches to the new one, and publishing the old
batch again rolls back. Compare `report` output before publishing, and `prune`
the superseded batch once the new one is confirmed.

## Reproduce the environment

Start from the checkpoint branch and read `AGENTS.md`, the repository
`README.md`, and `progress.md`. Don't assume files, credentials, containers,
virtual environments or databases exist in a new checkout.

Tested toolchains: Node 24.21.0 / 22.22.0, pnpm 12.14.0 (pinned), uv 0.13.0 /
0.11.32, Python 3.14.8 (Mac) and 3.14.6 (cloud; uv 0.11.32 offers no 3.14.8),
PostgreSQL 18.6 (container) and 16.15 (cloud host package). `compression.zstd`
needs Python 3.14 or newer.

```sh
uv python install 3.14
pnpm install --frozen-lockfile --ignore-scripts
cd apps/api
uv sync --locked
uv run --frozen pytest tests/unit/bulletin
uv run --frozen ruff check app/modules/bulletin tests/unit/bulletin
```

PDF extraction needs the ingest-only dependency group:
`uv sync --locked --group ingest`. Production installs don't include it.

### Disposable Postgres for imports and tests

Never use the application's database. Either the Compose project (tmpfs,
loopback port 55432):

```sh
docker compose -f docs/bulletin/compose.test.yaml up -d --wait
```

or, where Docker isn't available (the cloud host), a throwaway cluster from the
system's PostgreSQL packages:

```sh
B=/usr/lib/postgresql/16/bin; P=/var/tmp/bulletin-pg
mkdir -p $P && chown postgres $P
su postgres -c "$B/initdb -D $P/data -U bulletin_test --auth=trust -E UTF8"
su postgres -c "$B/pg_ctl -D $P/data -o '-p 55432 -k $P -c listen_addresses=127.0.0.1' -l $P/log start"
psql -h 127.0.0.1 -p 55432 -U bulletin_test postgres -c 'CREATE DATABASE bulletin_test' -c 'CREATE DATABASE bulletin_it'
```

Then migrate and test:

```sh
DATABASE_URL=postgresql+asyncpg://bulletin_test@127.0.0.1:55432/bulletin_test uv run --frozen alembic upgrade head
BULLETIN_TEST_DATABASE_URL=postgresql://bulletin_test@127.0.0.1:55432/bulletin_it \
  uv run --frozen pytest tests/integration/test_bulletin_database.py
uv run --frozen python -m scripts.bulletin_benchmark postgresql://bulletin_test@127.0.0.1:55432/bulletin_test 2026-2027 2024-2025
```

The integration tests drop and recreate the `bulletin` schema in the database
they're given.

## Production

`alembic upgrade head` creates the `bulletin` schema and enables `pg_trgm`. The
endpoints return 404 / empty lists until an edition is imported and published.
Loading production is a deliberate, separate step: run `import` against the
production database's direct (unpooled) URL from a development machine, check
`report`, then `publish`. It has not been done.

The older `/api/degree/parse-bulletin` endpoint parses HTML a client posts; it
fetches nothing and is unchanged. `/api/bulletin` supersedes it for data the
ingester has published.

## GitHub persistence

Code, this documentation and small reports belong in Git. Large public snapshots
belong in release assets: checkpoint tag `bulletin-checkpoint-20261024`, asset
`bulletin-checkpoint-20261024.tar.gz` (draft release). Never include `.env`,
credentials, student audits, or the ignored `data/` tree; `data/catalog` mixes
student audit context with academic data.

Create a checkpoint after stopping writers, outside the source tree:

```sh
uv run --frozen python -m app.modules.bulletin.ingest checkpoint --output /abs/path/checkpoint
uv run --frozen python -m app.modules.bulletin.ingest verify-checkpoint /abs/path/checkpoint
```

To restore, download the asset and its `.sha256`, check the archive's hash,
extract into a new empty directory, and run `verify-checkpoint` before pointing
`BULLETIN_DATA_DIR` at it. The 2026-10-24 archive was made with macOS `tar` and
carries AppleDouble `._*` metadata entries beside the payload; extract with
`--warning=no-unknown-keyword --exclude='._*'`. Use a new tag for each
checkpoint; never replace a known-good asset.

## Sources and access

On 2026-10-24 from the earlier Mac host, HTTP access succeeded for the current
[undergraduate](https://bulletin.temple.edu/undergraduate/) and
[graduate/professional](https://bulletin.temple.edu/graduate/) Bulletin,
[robots.txt](https://bulletin.temple.edu/robots.txt) and a
[legacy graduate archive](https://www.temple.edu/gradarchives/13-14/). The
Bulletin's robots.txt disallows `/archives/`, `/pdf/` and `/search/`; those come
only from retained captures or provenance-recorded manual files. From the Claude
Code cloud host the egress proxy refused both Temple hosts, so nothing was
fetched there; see `editions.md`.
