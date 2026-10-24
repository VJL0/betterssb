# Bulletin progress ledger

## 2026-10-24 — portable recovery checkpoint

**Environment correction:** this session ran on Darwin/arm64 at the existing Mac
checkout, not Claude Code Cloud. All access/tool checks below apply to this host;
repeat them on the actual cloud host. No cloud host was provisioned.

**Starting Git state:** `feat/bulletin-knowledge-base` at `ea81f89`, with the newer
ingester and crawler tests untracked. Live remote inspection returned only
`main`; local remote-tracking branches were stale. The earlier implementation is
preserved at `backup/bulletin-v1`, commit `d7c24cd`, in a separate worktree. Its
schema/loader/PDF parsers are reference material, not merged into this rewrite.

**Storage decision:** the user approved GitHub. The repository is public. Code,
this ledger and structural validation results belong in Git; large public source
snapshots belong in a draft release asset. Private audit context in `data/catalog`
is deliberately excluded. Existing local files remain untouched.

Checkpoint tag: `bulletin-checkpoint-20261024`
Asset: `bulletin-checkpoint-20261024.tar.gz`
SHA-256: `b14bfc0012d4aac475a1b8e9eaa57acba1a16b122697816f0fcc3e49fdffb46e`
Payload: 5,086 files, 686,344,343 uncompressed bytes; archive approximately 207 MiB.
The payload includes a SQLite backup, 5,073 compressed source objects and 12
retained extraction files. The release upload status is recorded below.

### Verified work

- Read root agent instructions and README, current crawler/extractors, prior
  implementation documentation and Git history before making changes.
- Node 24.21.0; pnpm 12.14.0; uv 0.13.0; project Python 3.14.8; host Python 3.15.0;
  Docker client/server 29.8.2; Compose 5.5.0; container PostgreSQL 18.6. Host `psql`
  is absent; PostgreSQL commands run inside the isolated container.
- Locked Python dependencies synced; frozen pnpm install completed without JS
  lifecycle scripts. The Python sync removed an extraneous PyMuPDF 1.28.2 install;
  the current rewrite does not declare or use it. The old PDF implementation needs
  its own declared ingest dependencies before execution.
- Live undergraduate/graduate/professional, robots, representative legacy archive,
  and tooling documentation access succeeded; see README for exact links.
- Current crawler test baseline: 32 passing. With checkpoint, development guard,
  and retained-extract validation tests: 43 passing. Ruff checks passed.
- Temporary PostgreSQL used a separate project, loopback port 55432, pinned image
  digest and tmpfs. `SELECT version()` succeeded; the container and network were
  removed. Existing application databases were not queried or modified.
- Checkpoint verified hashes, SQLite integrity, every referenced source object,
  and all stored object contents. A corrupted or incomplete checkpoint fails.
- Existing extracts passed current Pydantic schemas and summary-count checks.
  67,942 evidence references for 2024–2025 and 67,773 for 2026–2027 matched retained
  URL/hash provenance. See `validation-20261024.json` for per-file hashes. No
  sources were re-scraped and no extracts were regenerated.

| Edition | Retained pages | Courses | Programs | Meaning |
| --- | ---: | ---: | ---: | --- |
| 2024–2025 | 1,674 | 12,995 | 880 | Structurally checked extracts; academic review pending |
| 2026–2027 | 1,680 | 12,831 | 909 | Structurally checked extracts; academic review pending |

### Remaining work, in order

1. Restore the GitHub checkpoint on the actual cloud host and verify it before
   resuming. Set `BULLETIN_DATA_DIR` explicitly. Never assume a local Mac path.
2. Reconcile completeness by edition, level and professional school against the
   retained program index. Zero extraction issues does not establish completeness
   or correctness. Add input/parser fingerprints and review decisions so unchanged
   approved records can be reused without interpretation.
3. Review 11 failed URL records and two robots-blocked current records. Twenty-one
   legacy URLs spanning 2000–2014 remain pending. Earlier CourseLeaf archives and
   PDFs remain excluded by crawler policy; use existing/manual source imports.
4. Compare the prior schema and deterministic loader against the current evidence
   model. Add safe staging/promotion, immutable source references, rollback and
   edition-specific coverage gates. Do not reuse its ambient production DSN.
5. Implement and validate historical/PDF program rules and professional coverage;
   preserve unsupported prose as unresolved rather than guessing executable rules.
6. Implement read-only deterministic production endpoints against published,
   validated academic data. No production scraper or agent dependency. Production
   deployment and database promotion have not been performed.

### Persistence status

Prepared locally; upload receipt will be appended after GitHub confirms it.
