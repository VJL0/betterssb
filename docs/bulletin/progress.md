# Bulletin progress ledger

## 2026-10-24 (session 2, Claude Code cloud host) — interpretation, database, API

**Host:** Claude Code cloud container, Linux x86_64, 4 vCPU. Python 3.14.6 (uv
0.11.32 has no 3.14.8 build), Node 22.22.0, pnpm 12.14.0, PostgreSQL 16.15 from
the system packages (the Docker daemon isn't available). Branch
`claude/task-zvahay`, started from `87e25d1`.

**Network:** the egress proxy refused `bulletin.temple.edu` and `www.temple.edu`
(CONNECT 403), official documentation sites and github.com. PyPI and the GitHub
API for this repository were reachable. Nothing was fetched from Temple in this
session; robots.txt could not be rechecked here.

### Restored and verified

- Downloaded release asset `bulletin-checkpoint-20261024.tar.gz` (draft release,
  tag `bulletin-checkpoint-20261024`) through the GitHub API; SHA-256 matched
  `b14bfc00…fb46e`. The archive has no links or path escapes; it carries macOS
  AppleDouble entries, excluded on extraction. `verify-checkpoint` passed: 5,086
  files, 686,344,343 bytes.
- The 43 existing bulletin tests passed on the restored code before any change.

### Built (see `README.md`, `schema.md`)

- **Requirement language** (`rules.py`): typed requirement trees (`all`, `any`,
  `choose`, `course`, `course_filter`, `milestone`, `text`) with root roles,
  per-node sources, interpretation and validation status, and evaluation
  outcomes; prerequisite expressions with grades, concurrency, tests, counts,
  credit and GPA bounds.
- **Interpreters** (`ingest/interpret/`): program requirement tables and
  semester-grid curricula, prerequisites/corequisites, policy sections and
  numbered graduate-policy clauses, academic units, program metadata
  (credential, award, level, campuses, unit), GenEd course designations.
- **Extractor v3:** graduate program stubs classified as programs, page titles
  preferred over in-content h1s, word breaks kept across `<br>`/blocks,
  `/about-courses/` kept as information.
- **Database:** `bulletin` schema (18 tables, own SQLAlchemy metadata) with a
  reversible migration (`43a9d52b7403`); immutable fingerprinted batches,
  atomic per-edition release, rollback, prune, quality issues.
- **Commands:** `interpret`, `import`, `publish`, `prune`, `report`; benchmark
  script `scripts/bulletin_benchmark.py`.
- **API:** nine read-only endpoints under `/api/bulletin`; OpenAPI schema and
  the generated TypeScript client regenerated.
- **Degree evaluator** (`evaluate.py`): pure, conservative evaluation of a tree
  against completed courses, with property tests over real programs.
- **PDF extraction** (`extract-pdf`, pdfplumber in an ingest-only dependency
  group): text blocks, courses and requirement-table rows with page and bbox
  locators. Against all 1,672 retained 2024–2025 page PDFs with HTML twins:
  25,984 of 25,984 courses matched with identical titles, credits and
  prerequisites, 99.88% of requirement rows, 100% of characters kept. The full
  run over every stored PDF took 34 min 47 s in one process (peak 1,691 MB):
  2024–2025, 1,674 PDFs → 38,973 course records (all-level and level listings
  both print each course), 2,744 tables, 0 issues; the 2026–2027 undergraduate
  volume → 6,122 courses, 920 tables, 0 issues. PDF records don't yet feed
  `interpret`; a volume-to-pages bridge is being validated on that volume.

### Measured results (local disposable Postgres 16.15, not production)

Full rebuild from retained snapshots: extract 74 s, interpret 18 s, import and
publish 15 s for both editions. Re-importing unchanged inputs is a no-op (same
fingerprint, same batch).

| Published | 2026–2027 | 2024–2025 |
| --- | ---: | ---: |
| Courses | 12,831 | 12,995 |
| Programs (undergraduate / graduate / professional) | 917 (465 / 424 / 28) | 904 (462 / 414 / 28) |
| Suggested plans | 430 | 413 |
| Policy sections | 1,290 | 1,286 |
| Academic units | 33 | 31 |
| GenEd designations | 463 | 468 |
| Requisite passages interpreted / partial / uninterpreted | 3,658 / 43 / 2 | 3,623 / 47 / 7 |
| Requirement nodes interpreted / partial / uninterpreted | 29,239 / 2,654 / 1,629 | 31,485 / 2,629 / 1,700 |
| Requirement nodes structurally checked / unverified / failed | 21,526 / 11,990 / 6 | 23,510 / 12,299 / 5 |
| Requirement roots: requirement / curriculum / admission / accelerated / academic plan / other | 1,242 / 42 / 16 / 62 / 101 / 83 | 1,227 / 38 / 10 / 59 / 101 / 83 |
| Programs with no requirement or curriculum root | 23 | 38 |
| Course codes in requirement trees the edition doesn't list | 98 | 88 |
| Course codes in requisites the edition doesn't list | 207 | 211 |
| Error-severity issues | 0 | 0 |

"Structurally checked" means rows add up to a printed total; it is not academic
review. No record is marked `reviewed`. Counts come from `report-20261024.json`
and direct queries of the published batches.

Query latency (warm p95, 50 runs, production repository code; cold-connection
first runs 13–28 ms): course by code 5.6 ms, title search 7.8 ms, misspelt
search 6.9 ms, code-prefix search 5.1 ms, subject/credit filter 3.7 ms,
attribute/level filter 4.3 ms, majors in a college 1.5 ms, program search
3.6 ms, full requirement tree 3.2 ms, course history 1.6 ms, program history
1.0 ms, policy search 5.7 ms, comparing a program across two editions 8.8 ms.
Database size 139 MB including indexes. See `benchmark-20261024.json`.

Tests: 268 bulletin unit tests and 8 Postgres integration tests pass; the full
API suite (556 tests) and the API client's typecheck and tests pass.

### Independent verification

A separate agent parsed the original HTML with its own code and compared it
with the published database:

- All 25,826 course versions: codes, titles, credits, attributes, levels and
  locators had no errors; 58 descriptions (0.22%) had words joined across line
  breaks, fixed in extractor v3 (0 remain).
- 60 requisite expressions, including the 20 longest: none wrong.
- 90 stratified programs: 2,612 course nodes, 292 alternatives, 33 "&" pairs and
  91 printed totals, with no errors. Every Academic Programs Chart program is
  in the database, and every listed course code matches the source listings.
- Every row in each edition matches its own snapshot, including the 901 courses
  whose text differs between editions.
- Defects it found, all fixed and rebuilt: tables from admission, plan and
  accelerated tabs read as requirements; curricula published only as semester
  grids (DMD, PharmD, DPT…) had no requirement tree; parents marked interpreted
  over uninterpreted children; uncaptured row conditions; wildcard codes stored
  as courses; "at most N credits" read as a course count; upper bounds missing
  from flattened nodes.

### Remaining work, in order

1. **Network access.** Allow `bulletin.temple.edu` and `www.temple.edu` for the
   cloud environment, recheck robots.txt, then fetch the 23 pending legacy
   editions (2000–2014; robots allow them) and write their extractors.
2. **Manual sources for disallowed editions.** Archived CourseLeaf editions
   2014–2015 to 2023–2024, the 2025–2026 PDF-only edition and the full-volume
   PDFs are disallowed by robots.txt; they need files saved by a person and
   recorded with `import-file`/`import-capture` (see `editions.md`).
3. **Academic review.** Review the 6 + 5 failed totals, the partial and
   uninterpreted nodes (largest groups: elective slots described only in prose,
   counts on text leaves, footnote conditions), and the 23 + 38 programs with
   no requirement or curriculum root; mark reviewed nodes `reviewed`.
4. **Degree evaluator.** `evaluate.py` evaluates trees conservatively (see
   `schema.md`); not yet exposed through the API or the web app. Next: overlap
   rules from policy text, and optimal course allocation (OR-Tools CP-SAT)
   outside the read path.
5. **Production.** Run the migration, import and publish against production's
   direct database URL after review. Not done.
6. **Checkpoint.** Publish a new checkpoint release (`bulletin-checkpoint-…`)
   with the v3 extracts and interpreted files. The `gh` token on this host was
   invalid, so no release was created this session.

## 2026-10-24 (session 1, Mac) — portable recovery checkpoint

**Environment correction:** this session ran on Darwin/arm64 at the existing Mac
checkout, not Claude Code Cloud.

**Starting Git state:** `feat/bulletin-knowledge-base` at `ea81f89`, with the newer
ingester and crawler tests untracked. The earlier implementation is preserved at
`backup/bulletin-v1`, commit `d7c24cd`; its schema, loader and PDF parsers were
reference material and are superseded by the session 2 design.

**Storage decision:** the user approved GitHub. The repository is public. Code,
this ledger and structural validation results belong in Git; large public source
snapshots belong in a draft release asset. Private audit context in `data/catalog`
is deliberately excluded.

Checkpoint tag: `bulletin-checkpoint-20261024`
Asset: `bulletin-checkpoint-20261024.tar.gz`
SHA-256: `b14bfc0012d4aac475a1b8e9eaa57acba1a16b122697816f0fcc3e49fdffb46e`
Payload: 5,086 files, 686,344,343 uncompressed bytes; archive approximately 207 MiB
(asset 672950464, 217,105,396 bytes): a SQLite backup, 5,073 compressed source
objects and the v1 extraction files.

Verified then: Node 24.21.0, pnpm 12.14.0, uv 0.13.0, Python 3.14.8, Docker
29.8.2, PostgreSQL 18.6 in a container; live access to the current Bulletin,
robots.txt and a legacy archive; 43 tests; checkpoint upload, download and full
restore verification. Remote branches `feat/bulletin-knowledge-base`
(`f855bad`) and `backup/bulletin-v1` (`d7c24cd`); `main` unchanged.
