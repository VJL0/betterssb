# Bulletin edition inventory

Status as of 2026-10-24, from the crawl state in checkpoint
`bulletin-checkpoint-20261024` and the database import on the Claude Code cloud
host. "Published" means imported into Postgres and released through the gates;
it does not mean academically reviewed (see `progress.md`).

| Edition | Level | Source | Snapshots retained | Database |
| --- | --- | --- | --- | --- |
| 2026–2027 (current) | Undergraduate, graduate, professional | `bulletin.temple.edu` HTML crawl | 1,687 pages fetched; full undergraduate PDF imported by hand | Published: 12,831 courses, 917 programs, 1,284 policy sections |
| 2026–2027 | Graduate full-volume PDF | `/pdf/2026-2027-graduate.pdf` | Not fetched: robots.txt disallows `/pdf/` | — |
| 2025–2026 | All | Archive (PDF-only per the archive listing) | Not discovered or fetched: robots.txt disallows `/archives/`, and no manual copy was supplied | — |
| 2024–2025 | Undergraduate, graduate, professional | Prior capture of `/archives/2024-2025/` (HTML and per-page PDFs), recorded with provenance | 3,351 files (1,677 HTML, 1,674 PDF); 2 pages failed with HTTP 404 in the capture | Published from HTML: 12,995 courses, 904 programs, 1,279 policy sections |
| 2018–2019 to 2023–2024 | All | `/archives/YYYY-YYYY/` | Not discovered: the archive index is disallowed by robots.txt | — |
| 2014–2015 to 2017–2018 | Undergraduate, graduate | `/archives/YYYY-YYYY/` | Edition roots recorded from links; not fetched (robots.txt) | — |
| 2004–2005 to 2013–2014 | Undergraduate | `www.temple.edu/bulletin/archive/webarchive/bulletinYYYY/` (robots allow) | Pending: 10 edition roots queued | — |
| 2000–2001 to 2013–2014 | Graduate | `www.temple.edu/gradarchives/…` (robots allow; 2003–2005 is one volume) | Pending: 13 edition roots queued | — |

## What blocks the rest

- **robots.txt.** `bulletin.temple.edu/robots.txt` disallows `/archives/`, `/pdf/`,
  `/search/` and `/azindex/`. The ingester never fetches disallowed paths. Archived
  CourseLeaf editions and full-volume PDFs must come from files saved by a person
  and recorded with `import-file` / `import-capture` (provenance `manual_download`
  or `prior_capture`), as 2024–2025 was.
- **Network policy on the cloud host.** On 2026-10-24 the session's egress proxy
  refused `bulletin.temple.edu` and `www.temple.edu` (CONNECT 403), so neither the
  robots recheck nor the 23 pending legacy editions (which robots.txt allows)
  could be fetched. Allow those hosts in the environment's network settings, then
  run `fetch --target legacy`.
- **Legacy layouts.** The 2000–2014 editions use different page structures from
  CourseLeaf; the current extractors classify them as `legacy` and do not parse
  them. They need their own extractors once fetched.
- **PDF-only editions.** PDF extraction with page and bounding-box evidence
  (pdfplumber, in the ingest-only dependency group; see `technology.md`) is being
  validated against the 2024–2025 per-page PDFs, which have HTML counterparts.
  A full-volume 2025–2026 PDF has not been available to run it on.

## Adding an edition

1. Save the official files (HTML capture directory or PDF) and record them:
   `import-capture <dir>` or `import-file <path> --url <official URL>`.
2. `extract --edition YYYY-YYYY`, then `interpret --edition YYYY-YYYY`.
3. `import --edition YYYY-YYYY --database-url …` stages a batch; review
   `report`, then `publish <batch>`.
