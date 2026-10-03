---
name: har-inspect
description: Inspect HAR network captures of Ellucian Banner SSB traffic (e.g. data/ssb/*.har) to reverse-engineer endpoints, request payloads, and response shapes. Use when working out how an SSB call works (addCRNRegistrationItems, submitRegistration/batch, searchResults, getRegistrationEvents…), comparing a successful vs failing flow, or writing content-script code / types that mirror Banner's API.
---

# Inspecting SSB HAR captures

Captures live under `data/` (gitignored), grouped by system: `data/ssb/` for registration (SSB) flows and `data/dars/` for degree-audit (DARS) flows.

HAR files are large JSON blobs; never `cat` or `Read` them whole. Use the helper script, which lists entries compactly and redacts cookies, auth, and `X-Synchronizer-Token` values.

```bash
S=.claude/skills/har-inspect/scripts/har.py   # run from repo root

python3 $S list "data/ssb/<capture>.har"                    # index of non-static requests
python3 $S list "data/ssb/<capture>.har" --filter classRegistration
python3 $S show "data/ssb/<capture>.har" 2 --max 8000        # one entry: headers, parsed body, response
python3 $S diff "data/ssb/addcrnregistration and batch perfect result.har" \
                "data/ssb/addcrnregistration and batch error result.har"
```

## Workflow

1. `list` to find the calls of interest, then `show` only those indexes.
2. For a success/failure pair, `diff` first, then `show` the same endpoint from both files and compare the payloads and response bodies.
3. When writing TypeScript for the content script, derive types from the actual `show` output (field names, nulls, nesting), not from memory of Banner's API, since it varies between Banner versions and schools.
4. Banner's mutating calls need the page's `X-Synchronizer-Token` header and session cookies, which is why they run in the content script and not the backend.

## Capturing new HARs

To capture a live flow, use the chrome-devtools MCP (`list_network_requests` / `get_network_request`) on a Banner tab, or record in DevTools → Network → "Save all as HAR (sanitized)". Save it under `data/ssb/` or `data/dars/` (gitignored, so raw captures stay out of the repo). HARs hold session cookies and personal data, so if one ever moves somewhere tracked, scrub it first:

```bash
python3 $S show FILE 0 | head -40   # headers are redacted in output, but the file itself is not
grep -c '"name": "Cookie"' FILE     # should be 0 before a capture leaves data/
```
