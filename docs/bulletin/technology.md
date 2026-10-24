# Bulletin ingestion: technology decisions

Measured 2026-10-24 on the Claude Code cloud host: Linux x86_64, 4 vCPU, 15 GiB,
CPython 3.14.6. Bench scripts and raw results live outside the repository (session
scratchpad `research/`: `bench_pdf.py`, `bench_html.py`, `pdf-results.jsonl`,
`html-results.json`). Numbers are from one run each and are for comparison only.

## What this host could reach

| Source | Result |
| --- | --- |
| `bulletin.temple.edu`, `www.temple.edu` | Blocked by the egress proxy (CONNECT 403). No live fetching or robots recheck was possible. |
| Official docs (python-httpx.org, docs.scrapy.org, crawlee.dev, docs.crawl4ai.com, playwright.dev, docs.firecrawl.dev, pymupdf.readthedocs.io, docling docs, postgresql.org, docs.sqlalchemy.org, developers.google.com) | Blocked (403 via curl; DNS failure via WebFetch). |
| github.com | 403 |
| PyPI JSON API and package downloads | Reachable. Versions and licenses below come from it. |
| download.pytorch.org, Hugging Face model hosts | Blocked. Docling installed from PyPI (5.9 GB), but it could not download its layout/table models. |
| Web search | Available. Only secondary sources were found (cited at the end). |

Because the official documentation was unreachable, capability statements are
limited to what was exercised here or is stable public knowledge. Recheck them
against the docs links on a host that can reach them.

## Versions (PyPI, 2026-10-24)

| Package | Latest | Released | License | Locked in `apps/api/uv.lock` |
| --- | --- | --- | --- | --- |
| httpx | 0.28.1 | 2024-12-06 | BSD-3-Clause | 0.28.1 |
| lxml | 6.1.3 | 2026-09-02 | BSD-3-Clause | 6.0.2 |
| selectolax | 1.0.2 | 2026-10-22 | MIT | — |
| parsel | 1.12.1 | 2026-09-28 | BSD-3-Clause | — |
| scrapy | 2.19.0 | 2026-09-10 | BSD-3-Clause | — |
| crawlee | 1.11.0 | 2026-10-15 | Apache-2.0 | — |
| crawl4ai | 0.9.5 | 2026-10-14 | Apache-2.0 | — |
| playwright | 1.64.1 | 2026-10-22 | Apache-2.0 | — |
| firecrawl-py | 4.54.0 | 2026-10-22 | MIT (client of a hosted service) | — |
| docling | 2.142.1 | 2026-10-23 | MIT | — |
| marker-pdf | 2.0.0 | 2026-07-20 | Apache-2.0 code (model weights carry separate terms) | — |
| pymupdf | 2.0 | 2026-10-19 | AGPL-3.0 or commercial | — |
| pdfplumber | 0.11.10 | 2026-06-15 | MIT | — |
| pypdfium2 | 5.14.0 | 2026-10-04 | BSD-3-Clause / Apache-2.0 (PDFium) | — |
| sqlalchemy | 2.1.6 | 2026-10-21 | MIT | 2.0.48 |
| alembic | 1.20.1 | 2026-10-22 | MIT | 1.18.4 |
| asyncpg | 0.32.0 | 2026-10-06 | Apache-2.0 | 0.31.0 |
| ortools | 9.15.6755 | 2026-01-14 | Apache-2.0 | — |
| hypothesis | 6.170.9 | 2026-10-23 | MPL-2.0 | — |

Upgrading the locked API dependencies is outside the ingestion work and is not
proposed here.

## Benchmarks on retained Temple sources

### PDF extraction

Sample: 30 retained 2024–2025 CourseLeaf page PDFs (133 pages), stratified as
10 course listings, 12 program pages with requirement tables and 8 policy or
General Education pages. Each PDF was compared with the retained HTML snapshot
of the same page. Peak RSS is per process.

| Metric | pypdfium2 5.14.0 | PyMuPDF 2.0 | pdfplumber 0.11.10 |
| --- | ---: | ---: | ---: |
| Text extraction, pages/s | 512 | 180 (rebuilding lines from word boxes) | 11.9 |
| Text + table finder, pages/s | — (no table finder) | 2.6 | 10.9 |
| Peak RSS, MB | 38 | 381 | 239 |
| Word recall vs HTML `#contentarea` | 0.895 | 0.895 | 0.895 |
| Word precision | 0.964 | 0.964 | 0.964 |
| Course-code recall (all) | 0.997 | 0.997 | 0.997 |
| Course-code recall (course listings) | 1.000 | 1.000 | 1.000 |
| Requirement rows (code + hours) found on one text line | 0.969 | 1.000 | 1.000 |
| Same, from the library's table finder | — | 0.987 | 0.628 |
| Page number and bounding boxes | yes | yes | yes |

Notes:

- The PDFs come from CourseLeaf's print renderer. All three libraries read the
  same text, so word recall is limited by the PDFs, not the libraries. About 10%
  of HTML words (in-page navigation, some tab chrome) are not printed.
- PyMuPDF's plain `get_text()` emits one table cell per line. Rows must be
  rebuilt from `get_text("words")` coordinates, which the 1.000 figure does.
  Its `find_tables()` drops spaces inside cells (`MUSC8207`,
  `VocalPedagogyfortheChoralConductor`) and is the slowest path measured.
- Docling 2.142.1 and Marker 2.0.0 could not be measured, because both need
  model weights from hosts this environment blocks. Docling's install alone was
  5.9 GB (torch and related packages).
- No scanned or PDF-only edition (such as 2025–2026) is in the retained data.
  OCR needs, layout detection and merged-cell handling on those editions are
  **unmeasured**.

### PDF extractor agreement (`ingest/extract/pdf.py`, all retained pairs)

The implemented pdfplumber extractor was compared with the HTML extraction on
every retained 2024–2025 page PDF that has an HTML twin: 1,672 pairs, 8,373
pages, no errors.

| Measure | Result |
| --- | --- |
| Text kept | 100% of non-space characters on every PDF |
| Courses | 25,984 in HTML, 25,984 in PDF, all matched |
| Titles, credits, prerequisite text | 100% exact |
| Descriptions | 99.66% exact; 99.82% after whitespace normalization (the rest: line wraps at "-", "/", "+") |
| Requirement rows with courses or hours | 27,455 of 27,487 HTML rows (99.88%) |
| Throughput | 8–19 pages/s per process; full 3,046-page undergraduate volume in 374 s at 968 MB peak |

Where they differ, the PDF is sometimes more complete: the HTML table extractor
only reads linked course codes (the interpreter recovers the 133 unlinked codes
from the cell text, so they still reach the database). 30 hours-only HTML rows
were not found in the PDF.

### HTML parsing

Sample: 200 retained 2026–2027 HTML snapshots, 11.0 MB.

| Parser | docs/s | MB/s | `div.courseblock` found | `sc_courselist` rows found |
| --- | ---: | ---: | ---: | ---: |
| lxml 6.1.3 (`lxml.html` + XPath) | 794 | 43.7 | 2,520 | 3,171 |
| selectolax 1.0.2 (Lexbor + CSS) | 1,655 | 91.0 | 2,520 | 3,171 |

Both parsers found the same elements. At about 800 docs/s, lxml parses the
3,354 retained HTML pages of both editions in roughly 4 s. Parsing is not the
bottleneck.

## Decisions

| Concern | Decision | Why | Alternatives considered |
| --- | --- | --- | --- |
| HTTP fetching | **Keep httpx 0.28.1** with the existing `PoliteFetcher`: one host at a time, `min_interval` spacing, exponential backoff with full jitter, `Retry-After`, conditional requests, and manual redirects so each hop is checked against robots.txt. | It is already locked and tested (43 unit tests). Temple's CourseLeaf site serves static HTML, and the crawl is about 2–5k URLs per edition at 1 req/s, so the fetcher is not a throughput limit. | **Scrapy 2.19 / Crawlee 1.11:** their queueing, retries and autothrottle duplicate code that exists and is tested, and they add a framework whose robots and redirect behaviour would have to be re-verified. **Crawl4AI / Firecrawl:** LLM- and Markdown-oriented, and Firecrawl is a hosted service. Neither is wanted in a deterministic pipeline. |
| Browser rendering | **None.** Playwright only if a future page needs JavaScript. | Every retained snapshot already holds its course blocks, requirement tables and plan grids in the served HTML (the extracts above came from plain HTTP bodies). | Playwright 1.64.1 is kept as an on-demand fallback and is not installed. |
| HTML parsing | **Keep lxml.** | It is correct on every sampled page, and its XPath and `sourceline` support feed the `Locator` evidence (absolute XPath plus source line). selectolax is 2.1× faster here, but parsing all retained pages takes seconds, and the Lexbor tree exposes no XPath or source lines. | selectolax 1.0.2 (measured); parsel 1.12.1 (wraps lxml, adds nothing needed). |
| PDF extraction (CourseLeaf print PDFs, future PDF-only editions) | **pdfplumber 0.11.10 as the default.** pypdfium2 5.14.0 for fast text-only passes. PyMuPDF only if its AGPL license is accepted. | pdfplumber is MIT, exposes characters and words with coordinates, and recovered 100% of requirement rows from text lines. Its table finder (0.63) is weaker than line reconstruction, so tables should be rebuilt from word coordinates and column x-positions. pypdfium2 is the fastest (512 pages/s, 38 MB) but has no table model. PyMuPDF matched on accuracy, but its AGPL license and space loss in `find_tables()` count against it. | Docling, Marker (blocked here, heavy ML dependencies, needed only for scanned or complex layouts; re-evaluate on a PDF-only edition). The HTML snapshot stays authoritative where both exist. |
| Crawl state and raw snapshots | **Keep SQLite crawl state and the zstd content-addressed object store** (key = SHA-256 of the uncompressed bytes). | 5,073 objects, about 686 MB with SQLite. Checkpoint verification of all hashes and references takes about 5 s. The keys map directly to S3-style object storage if needed. | Postgres large objects or bytea (bloats the application database and backups). An external object store (not needed at this size). |
| Academic database | **PostgreSQL**, relational with typed JSONB only for requirement-expression payloads. | The production API already uses Postgres (Neon) through SQLAlchemy and asyncpg. The workload is edition-scoped lookups, joins (course→programs, program→requirements) and text search, all relational. Local tests use PostgreSQL 16.15. Use only features available in 16+. | Document databases (lose referential integrity between course, requirement and source). Graph databases (requirement trees are shallow, and prerequisite graphs fit in recursive CTEs or adjacency tables). Neither justifies a second production service. |
| Search | **PostgreSQL full-text search (`tsvector` + GIN), plus `pg_trgm` 1.6** for fuzzy titles and codes. `unaccent` is available. | All are available on the local 16.15 server and are standard Neon extensions. The corpus is about 13k course versions per edition, well within a single GIN index. Measured on the full import: title and misspelt-title searches 7–8 ms p95, code-prefix 5 ms, policy search 6 ms (`benchmark-20261024.json`), after using the indexable `%` operator rather than `similarity() >`. | Elasticsearch, OpenSearch, Meilisearch or a vector database (an extra service with no demonstrated need). |
| Requirement evaluation | **A deterministic tree evaluator** (implemented: `evaluate.py`) over the `rules.py` language, returning `satisfied` / `not_satisfied` / `unknown` / `requires_review` / `unsupported`. OR-Tools CP-SAT (9.15) is reserved for a future optimal course-to-requirement allocation under no-double-count constraints. | Retrieval and most checks need no solver. Allocation across overlapping requirements is the one NP-hard piece, and only it would justify CP-SAT (about 30 MB wheel, Apache-2.0). It should stay out of the read path. | Hand-written greedy allocation (may give wrong answers under sharing limits). An SMT solver (heavier, no advantage for this problem). |
| Property-based tests | **Seeded random records over real program trees** (`test_evaluate.py`), no new dependency. | The evaluator's invariants (nothing partial is satisfied, adding courses never turns satisfied into not satisfied, missing grades never fail) are checked over 40 random records per real program fixture, and over all 1,821 published trees in a smoke run. | hypothesis 6.170.9 (MPL-2.0): stronger shrinking, not needed yet. |

## Secondary sources consulted (web search)

These are not official documentation. They were used only to frame the
benchmark, and the measurements above supersede them:
[pdf-extraction-benchmark](https://github.com/justin-aj/pdf-extraction-benchmark),
[Camelot's comparison page](https://camelot-py.readthedocs.io/en/latest/user/comparison.html),
[pdfplumber vs PyMuPDF](https://www.file2markdown.ai/blog/pdfplumber-vs-pymupdf).
