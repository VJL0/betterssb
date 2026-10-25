# Banner unofficial transcript PDF parser

The PDF parser runs locally in Python or through `POST /api/transcript/parse-pdf`
with the raw file body and `Content-Type: application/pdf`. That endpoint returns
compact academic data: courses, GPA, current program, periods, term/final totals,
and diagnostics. It omits names, source glyphs, PDF metadata, repeated cumulative
snapshots, historical profile fields, and empty source cells.

Open `/transcript/data` (linked from Transcript) to upload a PDF and switch between
simple and detailed JSON. This page calls `POST /api/transcript/parse-pdf/data`,
which returns `{valid, data, details}`. Partial parses remain inspectable here;
the normal endpoint rejects incomplete parsing with a simple 422 problem response.
Neither endpoint persists the document. The data page keeps results in memory,
does not replace the saved transcript, and masks the JSON from Sentry Replay.
The existing pasted-text endpoint remains available.

Parsing failures send Sentry an error event containing only diagnostic codes and
counts, using the application's existing production-only Sentry setup. Raw text,
glyphs, student fields and parser exception messages are not attached. An image
review notice alone (such as the reference PDF's information icon) does not create
an error event. Detailed source content remains available in the inspection response
and the local CLI output.

```sh
cd apps/api
uv run python -m scripts.parse_transcript '/path/to/transcript.pdf' --output result.json
```

## Document analysis

The reference is a three-page Temple Banner export produced by Apache FOP 2.6.
All three pages were rendered and reviewed against the extracted text and columns.
It contains 120 nonempty text lines and 4,520 source glyphs (including whitespace).
The source layer includes three additional records for whitespace omitted from
pdfplumber's line extraction. The information icon is an embedded image; it is
reported for visual review, not interpreted as academic data.

There are eight period blocks: two transfer periods, five institutional terms,
and one in-progress term. All 28 course attempts are separate records: three
transfer, twenty institutional, five in progress. Twelve period totals and three
transcript totals preserve all six numeric columns, their printed precision and
their labels. The overall GPA is read from the printed totals, not recalculated
from rounded course grades.

### Patterns and ambiguities

- Student fields form two- and three-column tables. The department wraps under
  the major while the minor occupies the adjacent column. Reading order alone
  interleaves these values.
- The degree is printed below `Current Program`; the program, college, campus,
  major/department and minor are separate values. Historical college, major,
  student type and academic standing belong to each term, not the current profile.
- Transfer period labels are `Spring,23` and `Spring,24`; the text after the colon
  identifies the credit source. Preserve the two-digit year without inventing a
  century. `NT` and `TR` are distinct printed grades and both attempts remain.
- Three course layouts occur: transfer (seven columns), institution (ten columns),
  and in progress (six columns). The institutional header wraps over three lines.
- Titles wrap: `Intro to Academics in Comp Sci`, `Math Concepts in Computing I/II`,
  `Comp Sys & Low-Level Program`, and `Intro Systems Prog & Oper Sys`.
- The grade for `Data Structures & Algorithms` touches the title in plain text.
  Header-derived glyph coordinates separate the grade correctly.
- The PDF uses ligatures such as `ff` and `ffi`. Source glyphs remain unchanged;
  extraction expands them once for semantic values. Expanding during both line
  extraction and cell extraction duplicates letters.
- `R` and `CEU Contact Hours` cells are blank. Blanks remain empty in `cells`, and
  optional typed values remain null. In-progress grades are empty strings for
  compatibility with the existing course shape; missing quality points are null.
- Transfer totals say `Earned Hours`; institutional and overall totals say
  `CEU Hours`. The parser retains those labels without treating them as synonyms.
- The withdrawn and subsequent graded Calculus II attempts remain distinct.
  Credits on a course row do not imply earned credits or prerequisite completion.
- Page 3 continues the in-progress course table without headers or a term label.
  The parser carries column and period context across the page boundary.
- Printed titles may be abbreviated. The parser does not expand them from a
  catalog, infer completion from the current date, interpret grade codes, or
  manufacture values for blank cells.

## Output and coverage

`student`, `periods`, `courses` and `totals` hold interpreted values. Course `cells`
retain the exact column strings, including empty values and decimal precision.
`sourceLines` references zero-based line IDs; page numbers are one-based.
`pages` retain dimensions, extracted text, character and image counts. `lines`
retain classification and all source glyphs, with text, coordinates, font and size.
PDF metadata is retained separately. No extracted text is executed as instructions.

Unrecognized lines and malformed numeric rows produce diagnostics instead of
silently disappearing. Images and pages with no text layer require visual review;
there is no OCR. Source glyphs preserve text evidence, not the original binary
PDF, image streams, vector artwork, or digital signatures. Keep the input PDF.

This is a parser for the observed Banner layout, not a universal transcript parser.
Other layouts can produce partial output with diagnostics; inspect those before
using the records. Current limits are 10 MiB and 100 pages. The local CLI writes
sensitive transcript data only to the specified output (or stdout).

## Validation

The layout regression fixture preserves all source geometry and replaces the name
with Xs; it is not the original PDF. Tests cover all row/category counts, all source
glyph counts, header-derived columns, wrapped titles, ligatures, blank fields,
term history, repeated attempts, unknown lines, invalid numeric cells, real PDF
extraction, blank pages, HTTP error behavior, and the input size limit.
