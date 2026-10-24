# Undergraduate catalog ingestion

This is a local, deterministic importer, with no LLM calls or external uploads.
It retains the complete PDF and audit JSON and builds a searchable evidence graph
in PostgreSQL. It does **not** claim that every natural-language academic rule has
been converted into executable logic. The catalog includes exceptions, permission
requirements, test scores, conditional alternatives, and requirements depending on
a student's matriculation year. Those statements must retain their wording.

## Run

From the repository root, using `uv` (dependencies are declared in the script):

```sh
uv run apps/api/scripts/catalog_ingest/import_catalog.py extract \
  --pdf '/Users/victor/Downloads/2026-2027-undergraduate.pdf' \
  --context '/Users/victor/Downloads/dars_ai_context (1).json' \
  --output data/catalog/2026-2027

uv run apps/api/scripts/catalog_ingest/import_catalog.py verify \
  --input data/catalog/2026-2027

# Set DATABASE_URL_UNPOOLED or DATABASE_URL in your shell first.
# The script accepts the application's postgresql+asyncpg:// URL as well.
uv run apps/api/scripts/catalog_ingest/import_catalog.py load \
  --input data/catalog/2026-2027
```

Extraction refuses to overwrite a directory. A manifest appears only after a
complete successful extraction. `verify` writes `verification.json`, checks all
file hashes, record uniqueness, page coverage and graph endpoints, and lists
course header candidates without a structured definition. Load verifies file checksums, uses parameterized
SQL and COPY, and commits only after counts and deferred graph foreign keys pass.
A repeat import is rejected unless `load --replace` is supplied; replacement is
atomic and scoped to the exact PDF SHA-256. The schema is explicitly installed by
the loader, independently of the application's Alembic migrations. It creates no
application endpoints or degree-audit integration.

`--skip-tables` speeds up extraction but omits table candidates and records that
omission in the manifest. Original source bytes are always retained. For detailed
local debugging set `CATALOG_DEBUG=1`; driver diagnostics can contain connection
information, so do not post them publicly.

## What is stored

- `catalog_ingest.documents`: exact PDF bytes, PDF SHA-256, manifest, complete audit
  JSON, extraction version, warnings and catalog year.
- `catalog_ingest.records`: pages; text blocks; font/position based heading
  candidates; original table cells and ordered rows; bookmark sections and
  hierarchy; course identities and definitions; verbatim course rules; program
  code occurrences; policy candidates; PDF links; printed page references;
  contact emails; attachments; and every audit JSON node, including nulls,
  booleans, empty strings, ordered arrays and escaped JSON pointers.
- `catalog_ingest.edges`: containment, section hierarchy, section/page overlap,
  table-row order, course mentions, definitions, rule references, internal PDF
  links, resolved printed-page references, email mentions, audit JSON hierarchy
  and source-displayed audit course membership. Each edge retains evidence.
- Each page includes full extracted text, layout with text spans, fonts, sizes,
  colors, bounding boxes and reading order; dimensions, crop/rotation, links,
  annotations, widgets and image locations. Original bytes preserve graphics,
  actual images, vector art and other PDF objects regardless of parser support.
- GIN indexes support full-text and JSON queries. Source and target indexes let
  callers traverse relationships in either direction.

Page numbers in record `page` fields are **one-based physical PDF pages**. The
bulletin's printed numbers are different. Printed references are resolved using
numbers actually found in page headers, without assuming an offset. Raw reference
text is retained even when a destination cannot be resolved.

An audit for **Fall 2024** cannot establish which **2026–2027** requirements apply
to that student. The loader preserves both versions separately and reports this
mismatch. The student's status, grades, eligible-list qualifiers, ranges, OR-index
arrays and source interpretation notes remain literal source data. A lexical
course match does not establish approved substitution, equivalence or double
counting, and a credit total is not automatically additive.

Convenience views are available as `catalog_ingest.courses`,
`catalog_ingest.course_rules`, and `catalog_ingest.program_sections`. A course
identity with no definition in this bulletin remains available in `records`;
absence of a definition does not prove that the course does not exist.

## Query examples

All examples should be scoped to the desired `document_id` when multiple
bulletins have been imported. Keys are unique only within a document.

Find a course and its complete source description/rules:

```sql
SELECT r.page, r.text, r.attributes
FROM catalog_ingest.edges e
JOIN catalog_ingest.records r
  ON r.document_id = e.document_id AND r.key = e.target
WHERE e.source = 'course:CIS 1051' AND e.relation = 'has_definition';
```

Find every occurrence of a course in program requirements, policies, tables,
course definitions and audit text, with page evidence:

```sql
SELECT r.kind, r.page, r.text, e.evidence
FROM catalog_ingest.edges e
JOIN catalog_ingest.records r
  ON r.document_id = e.document_id AND r.key = e.source
WHERE e.target = 'course:CIS 2168'
ORDER BY r.page NULLS LAST;
```

Search grade, residency, transfer, overlap and graduation policies:

```sql
SELECT document_id, key, kind, page, text
FROM catalog_ingest.records
WHERE search @@ websearch_to_tsquery('english', '"transfer credit"')
  AND kind IN ('text_block', 'policy_candidate', 'course_rule');
```

Read a program using the bookmark hierarchy and page evidence:

```sql
SELECT p.page, p.text
FROM catalog_ingest.records s
JOIN catalog_ingest.edges e
  ON e.document_id = s.document_id AND e.source = s.key
JOIN catalog_ingest.records p
  ON p.document_id = e.document_id AND p.key = e.target
WHERE s.kind = 'section' AND s.text = 'Computer Science BS'
  AND e.relation = 'overlaps_page'
ORDER BY p.page;
```

Explore paths with a finite depth bound and cycle protection:

```sql
WITH RECURSIVE paths AS (
  SELECT document_id, key AS node, ARRAY[key] AS visited, 0 AS depth
  FROM catalog_ingest.records
  WHERE key = 'course:CIS 2168'
  UNION ALL
  SELECT p.document_id, e.target, p.visited || e.target, p.depth + 1
  FROM paths p
  JOIN catalog_ingest.edges e
    ON e.document_id = p.document_id AND e.source = p.node
  WHERE p.depth < 4 AND NOT e.target = ANY(p.visited)
)
SELECT * FROM paths;
```

The graph preserves cycles and alternatives rather than enumerating every path.
Path counts can grow exponentially. Use relation filters and depth bounds for
exploration. A path through a mention is contextual evidence, not a logical proof
that a prerequisite or graduation condition is satisfied.

## Review limitations

Geometry-based tables can include prose, split merged cells, or split at page
boundaries; original rows, text and coordinates remain available for correction.
`next_row` preserves order without guessing whether an OR applies to a previous
row, a footnote, a concentration, or a whole requirement. Heading and policy
candidates are explicitly heuristic. Course headers also require bold font
evidence so a sentence beginning with a course reference cannot absorb the next
course definition. Discrete credit options (for example, 0 or 4) are stored as
`credit_model=discrete_options` and a `credit_options` array; numeric minimum and
maximum alone must not be interpreted as allowing intermediate credits. Section boundaries overlap when two sections
start on the same page. Long course headings are joined for parsing; source text
and coordinates are never replaced by that derived representation. Course header
recognition is tailored to this bulletin's four-digit course codes.

No OCR or semantic reading of images is performed. Low-text pages are flagged for
review; figures/images still exist in the original PDF. Abbreviated course lists,
subject names, shorthand ranges, cross-listing, exclusions, substitutions, minimum
grades, placement tests, AND/OR parentheses, concurrency, residency, approvals,
fees, dates, contact roles and recommended plans retain their source text even
when they have no specialized normalized field. Review the manifest and source
before using derived data to make enrollment decisions.

If course parsing rules improve, regenerate definitions and rules from retained
page layouts without repeating PDF table detection:

```sh
uv run apps/api/scripts/catalog_ingest/import_catalog.py rebuild-courses \
  --input data/catalog/2026-2027
```

This verifies file hashes, replaces only derived course definitions/rules and
related graph edges, updates manifest checksums/counts, and verifies the resulting
graph. Run `load --replace` afterwards to apply the refreshed archive to an
already-imported document.

## Tests

```sh
cd apps/api
uv run --with pymupdf pytest tests/unit/test_catalog_ingest.py
```
