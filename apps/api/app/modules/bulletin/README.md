# Bulletin

Temple's undergraduate Bulletin, one edition per academic year (2022-2023 through 2026-2027), in the Postgres `bulletin` schema: courses, programs, requirement and prerequisite rule trees, suggested plans, GenEd areas and policies. It's loaded by a command-line ingester; there are no API routes yet.

## Sources

Temple's `robots.txt` disallows `/archives/`, which holds every earlier edition's HTML and PDF, so the crawler only fetches the live site (the current edition) and stops if it can't read `robots.txt`. Earlier editions come from their volume PDF, downloaded by hand from the [Bulletin archives page](https://bulletin.temple.edu/archives/), or from an HTML capture already on disk.

| Edition   | Source                                                    | Loads                               |
| --------- | --------------------------------------------------------- | ----------------------------------- |
| 2026-2027 | `crawl` of the live site                                  | Everything                          |
| 2025-2026 | Volume PDF (Temple published no HTML for it)              | Courses, prerequisites and policies |
| 2024-2025 | Capture in `data/catalog-comparison/2024-2025`, or PDF    | Everything from the capture         |
| 2023-2024 | Volume PDF                                                | Courses, prerequisites and policies |
| 2022-2023 | Volume PDF                                                | Courses, prerequisites and policies |

Programs aren't read from PDFs: their tables are positioned text, and requirement trees guessed from coordinates would look authoritative and not be. Checked against the 2024-2025 HTML, the PDF reader gets every one of its 6,111 courses with identical titles, credits, descriptions and labeled parts.

## Commands

From `apps/api`, after `uv run alembic upgrade head`:

```bash
uv run python -m app.modules.bulletin.ingest crawl     # ~13 minutes at 1 request/second
uv run python -m app.modules.bulletin.ingest load-html --edition 2026-2027
uv run python -m app.modules.bulletin.ingest load-html --edition 2024-2025 --capture ../../data/catalog-comparison/2024-2025
uv run --group ingest python -m app.modules.bulletin.ingest load-pdf --edition 2025-2026 --pdf ~/Downloads/2025-2026-undergraduate.pdf
uv run python -m app.modules.bulletin.ingest status
```

`crawl` writes `data/bulletin/2026-2027/capture` and resumes if interrupted. Loading copies each source file into `data/bulletin/raw/<sha256>.<ext>`, the object store that `source_snapshots.raw_object_key` points into. A load replaces its edition in one transaction: rows go in as `staging`, consistency checks run (rule sets belong to their edition, every tree has one root, a parent's id is less than its children's), and the edition becomes `published` only if they pass. PyMuPDF is in the `ingest` dependency group so the deployed API doesn't carry it.

## Schema

Stable identities (`courses`, `programs`, `policies`, `subjects`, `attributes`) outlive editions; what an edition says about them is a `*_versions` row. CIS 3296 in 2024-2025 and in 2026-2027 are two versions of one course, and matching codes don't establish equivalence across a renumbering.

- **Sources**: `editions`, `crawl_runs`, `source_pages`, `source_snapshots`, `ingestion_issues`. Every version row has the snapshot it came from.
- **Courses**: `course_versions` (title, credits, description, prerequisite text, every labeled part in `parts`, a full-text `search` column), `course_attributes`, `course_restriction_groups`/`_options`, and `course_relationships`, the courses a description names and whether the sentence is about duplicate credit or cross-listing.
- **Programs**: `academic_units`, `program_versions` (code, degree, overview and the requirements tab's prose), and the suggested plan in `plan_templates` → `plan_terms` → `plan_items` → `plan_item_courses`. A plan is advice, kept apart from requirements.
- **Rules**: `rule_sets` hold one tree each (a program table, a prerequisite, a corequisite, a GenEd area) as `rule_nodes`; `rule_node_courses` and `rule_node_attributes` index them in reverse; `program_rule_sets` and `course_rule_sets` attach them.

Node types are `all`, `any`, `count` (`min_count` of the children), `credits` (`min_credits`–`max_credits` from the children), `section` (a table heading; the source doesn't say whether all or one apply), `course`, `course_range`, `attribute`, `test` (`'Y' in MC3`) and `text`. `params` holds the rest: minimum grade, `concurrent`, a credit hours column, footnote markers, a table's footnotes and total.

Every node keeps its source wording and a `parse_status`: `complete`, `partial` (some wording wasn't understood, e.g. a "Biology Sequence" heading that probably names one of several alternatives) or `raw` (only text, e.g. "Two (2) laboratory science courses", "minimum GPA of 3"). A rule set's status is its tree's. Treat anything short of `complete` as something to show a student, not to decide for them. In both HTML editions about 97% of prerequisites parse completely, and a little over half of program tables do; the rest are mostly requirements stated in prose.

## Queries

The courses a course's prerequisites name, at any depth, through any alternative:

```sql
WITH RECURSIVE prerequisite(course_id, required_id) AS (
  SELECT cv.course_id, rnc.course_id
  FROM bulletin.course_versions cv
  JOIN bulletin.editions e ON e.id = cv.edition_id AND e.label = '2026-2027'
  JOIN bulletin.course_rule_sets crs ON crs.course_version_id = cv.id
  JOIN bulletin.rule_sets rs ON rs.id = crs.rule_set_id AND rs.kind = 'prerequisite'
  JOIN bulletin.rule_nodes n ON n.rule_set_id = rs.id
  JOIN bulletin.rule_node_courses rnc ON rnc.rule_node_id = n.id
), chain(course_id, depth, path) AS (
  SELECT id, 0, ARRAY[id] FROM bulletin.courses WHERE subject_code = 'CIS' AND number = '3296'
  UNION ALL
  SELECT p.required_id, c.depth + 1, c.path || p.required_id
  FROM chain c JOIN prerequisite p ON p.course_id = c.course_id
  WHERE c.depth < 6 AND NOT p.required_id = ANY(c.path)
)
SELECT co.subject_code, co.number, min(depth)
FROM chain JOIN bulletin.courses co ON co.id = chain.course_id
GROUP BY 1, 2 ORDER BY 3;
```

Programs whose requirements name a course:

```sql
SELECT DISTINCT pv.name
FROM bulletin.rule_node_courses rnc
JOIN bulletin.courses c ON c.id = rnc.course_id
JOIN bulletin.rule_nodes n ON n.id = rnc.rule_node_id
JOIN bulletin.program_rule_sets prs ON prs.rule_set_id = n.rule_set_id
JOIN bulletin.program_versions pv ON pv.id = prs.program_version_id
JOIN bulletin.editions e ON e.id = pv.edition_id
WHERE c.subject_code = 'CIS' AND c.number = '3296' AND e.label = '2026-2027';
```

Course search: `WHERE search @@ websearch_to_tsquery('english', 'machine learning')`, ranked with `ts_rank(search, query)`.
