#!/usr/bin/env python3
"""Inspect HAR captures of Banner SSB traffic without dumping whole files into context.

  har.py list  FILE [--filter SUBSTR] [--all]   one line per request (skips static assets unless --all)
  har.py show  FILE INDEX [--max N]             full request/response for one entry (secrets redacted)
  har.py diff  FILE_A FILE_B                    endpoints that differ in presence or status between two captures
"""

import argparse
import json
import sys
from urllib.parse import parse_qsl, urlparse

STATIC = (".js", ".css", ".png", ".jpg", ".gif", ".svg", ".woff", ".woff2", ".ico", ".map")
SECRET_HEADERS = {"cookie", "set-cookie", "authorization", "x-synchronizer-token", "proxy-authorization"}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["log"]["entries"]


def redact(headers):
    return {h["name"]: "<redacted>" if h["name"].lower() in SECRET_HEADERS else h["value"] for h in headers}


def clip(text, n):
    if text is None:
        return None
    return text if len(text) <= n else f"{text[:n]}… [{len(text) - n} more chars]"


def maybe_json(text):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return text


def cmd_list(args):
    for i, e in enumerate(load(args.file)):
        r, s = e["request"], e["response"]
        u = urlparse(r["url"])
        if not args.all and u.path.lower().endswith(STATIC):
            continue
        if args.filter and args.filter.lower() not in r["url"].lower():
            continue
        mime = (s["content"].get("mimeType") or "").split(";")[0]
        print(f"[{i:>3}] {r['method']:<6} {s['status']:<4} {u.path}{'?' + u.query if u.query else ''}  ({mime}, {s['content'].get('size', 0)}B)")


def cmd_show(args):
    e = load(args.file)[args.index]
    r, s = e["request"], e["response"]
    body = (r.get("postData") or {}).get("text")
    if body and "x-www-form-urlencoded" in (r.get("postData") or {}).get("mimeType", ""):
        body = dict(parse_qsl(body))
    out = {
        "request": {
            "method": r["method"],
            "url": r["url"],
            "headers": redact(r["headers"]),
            "body": maybe_json(body) if isinstance(body, str) else body,
        },
        "response": {
            "status": s["status"],
            "headers": redact(s["headers"]),
            "body": maybe_json(clip(s["content"].get("text"), args.max)),
        },
    }
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    print()


def endpoints(path):
    seen = {}
    for e in load(path):
        u = urlparse(e["request"]["url"])
        if u.path.lower().endswith(STATIC):
            continue
        seen.setdefault(f"{e['request']['method']} {u.path}", set()).add(e["response"]["status"])
    return seen


def cmd_diff(args):
    a, b = endpoints(args.a), endpoints(args.b)
    changed = [k for k in sorted(a.keys() | b.keys()) if a.get(k) != b.get(k)]
    for key in changed:
        print(f"{key}\n    A: {sorted(a.get(key, [])) or '-'}   B: {sorted(b.get(key, [])) or '-'}")
    if not changed:
        print("Same endpoints and statuses in both; the difference is in the bodies. Compare with `show`.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("list")
    pl.add_argument("file")
    pl.add_argument("--filter")
    pl.add_argument("--all", action="store_true")
    ps = sub.add_parser("show")
    ps.add_argument("file")
    ps.add_argument("index", type=int)
    ps.add_argument("--max", type=int, default=4000, help="max response body chars")
    pd = sub.add_parser("diff")
    pd.add_argument("a")
    pd.add_argument("b")
    args = p.parse_args()
    {"list": cmd_list, "show": cmd_show, "diff": cmd_diff}[args.cmd](args)


if __name__ == "__main__":
    main()
