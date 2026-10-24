"""Which URLs belong to the Bulletin, which edition they're from, and whether
the ingester may fetch them.

Two hosts publish Temple's catalogs:

- `bulletin.temple.edu` serves the current edition at the site root. Its
  robots.txt disallows `/archives/` (every earlier edition from 2014-2015 on)
  and `/pdf/` (the full-volume PDFs), so those are recorded but never fetched;
  copies downloaded by hand go through the inbox instead.
- `www.temple.edu` hosts the legacy archives: undergraduate editions 2004-2005
  to 2013-2014 under `/bulletin/archive/webarchive/bulletinYYYY/`, graduate
  editions 2000-2001 to 2013-2014 under `/gradarchives/`. Its robots.txt allows
  them.

Anything else is an external link: classified and kept, not crawled.
"""

from __future__ import annotations

import posixpath
import re
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit, urlunsplit

BULLETIN_HOST = "bulletin.temple.edu"
LEGACY_HOST = "www.temple.edu"
# Both hosts serve HTTPS; old pages link with http://, which would otherwise
# double every URL.
HTTPS_HOSTS = frozenset({BULLETIN_HOST, LEGACY_HOST})
CURRENT_EDITION = "2026-2027"

CURRENT_TOP_LEVEL_PAGES = frozenset(
    {
        "/",
        "/sitemap/",
        "/sitemap.xml",
        "/academic-programs/",
        "/about-courses/",
        "/faculty/",
    }
)
CURRENT_SECTION_PREFIXES = ("/undergraduate/", "/graduate/", "/courses/")
LEGACY_UNDERGRADUATE = re.compile(r"^/bulletin/archive/webarchive/bulletin(\d{4})/")
# 00_01, 13-14, and the one two-year edition, 03-05.
LEGACY_GRADUATE = re.compile(r"^/gradarchives/(\d{2})[-_](\d{2})/")
ARCHIVE_PATH = re.compile(r"^/archives/(\d{4})-(\d{4})/")
PATH_SAFE_CHARACTERS = "/%:@!$&'()*+,;=-._~"


class Level(StrEnum):
    UNDERGRADUATE = "undergraduate"
    GRADUATE = "graduate"
    # Pages that cover both, such as /courses/ and the site root.
    ALL = "all"


class Scope(StrEnum):
    CURRENT = "current"
    ARCHIVE = "archive"
    LEGACY = "legacy"
    EXTERNAL = "external"


@dataclass(frozen=True, slots=True)
class UrlInfo:
    url: str
    scope: Scope
    eligible: bool
    reason: str
    edition: str | None = None
    level: Level | None = None


def normalize_url(href: str, base: str | None = None) -> str | None:
    """An absolute, comparable URL, or None for mailto:, javascript: and the like.

    Fragments go; query strings stay (legacy .asp pages use them). Hrefs with
    stray whitespace (one 2024-2025 page links `34-podiatry/ `) are trimmed.
    """
    href = href.strip()
    if not href:
        return None
    parts = urlsplit(urljoin(base, href) if base else href)
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"} or not parts.hostname:
        return None
    host = parts.hostname.lower()
    if host in HTTPS_HOSTS:
        scheme = "https"
    netloc = host if parts.port in {None, 80, 443} else f"{host}:{parts.port}"
    return urlunsplit((scheme, netloc, _normalize_path(parts.path), parts.query, ""))


def _normalize_path(path: str) -> str:
    if not path:
        return "/"
    trailing_slash = path.endswith("/")
    collapsed = posixpath.normpath(re.sub(r"/{2,}", "/", path))
    if collapsed == ".":
        collapsed = "/"
    if trailing_slash and not collapsed.endswith("/"):
        collapsed += "/"
    return quote(unquote(collapsed), safe=PATH_SAFE_CHARACTERS)


def legacy_edition(path: str) -> tuple[str, Level] | None:
    if match := LEGACY_UNDERGRADUATE.match(path):
        start = int(match[1])
        return f"{start}-{start + 1}", Level.UNDERGRADUATE
    if match := LEGACY_GRADUATE.match(path):
        start, end = (2000 + int(year) for year in match.groups())
        return f"{start}-{end}", Level.GRADUATE
    return None


def classify_url(url: str) -> UrlInfo:
    """Scope, edition and crawl eligibility from the URL alone.

    robots.txt is checked separately at fetch time; this encodes what the
    catalog's own structure says belongs in scope.
    """
    parts = urlsplit(url)
    host, path = parts.hostname or "", parts.path or "/"
    if host == BULLETIN_HOST:
        return _classify_bulletin(url, path)
    if host == LEGACY_HOST and (found := legacy_edition(path)):
        edition, level = found
        return UrlInfo(url, Scope.LEGACY, True, "legacy archive", edition, level)
    return UrlInfo(url, Scope.EXTERNAL, False, "external link, recorded not crawled")


def _classify_bulletin(url: str, path: str) -> UrlInfo:
    if match := ARCHIVE_PATH.match(path):
        level = _section_level(path[match.end() - 1 :])
        return UrlInfo(
            url,
            Scope.ARCHIVE,
            False,
            "archived edition; robots.txt disallows /archives/",
            f"{match[1]}-{match[2]}",
            level,
        )
    if path.startswith("/search/"):
        course = parse_qs(urlsplit(url).query).get("P", [""])[0]
        subject = course.split()[0].lower() if course.split() else ""
        detail = f"; its content is on /courses/{subject}/" if subject else ""
        return UrlInfo(
            url,
            Scope.CURRENT,
            False,
            f"course search result{detail}; robots.txt disallows /search/",
            CURRENT_EDITION,
            Level.ALL,
        )
    if path.startswith("/pdf/"):
        return UrlInfo(
            url,
            Scope.CURRENT,
            False,
            "full-volume PDF; robots.txt disallows /pdf/",
            CURRENT_EDITION,
            Level.ALL,
        )
    if path.lower().endswith(".pdf"):
        # CourseLeaf's "print this page" export of the HTML page it sits under.
        return UrlInfo(
            url,
            Scope.CURRENT,
            False,
            "print export duplicating an HTML page",
            CURRENT_EDITION,
            _section_level(path),
        )
    if path in CURRENT_TOP_LEVEL_PAGES or path.startswith(CURRENT_SECTION_PREFIXES):
        return UrlInfo(
            url,
            Scope.CURRENT,
            True,
            "current edition page",
            CURRENT_EDITION,
            _section_level(path),
        )
    # Anything else robots.txt allows is still the catalog's own page (a stray
    # sitemap entry, an index); robots.txt has the final say at fetch time.
    return UrlInfo(
        url,
        Scope.CURRENT,
        True,
        "current edition page outside the main sections",
        CURRENT_EDITION,
        Level.ALL,
    )


def _section_level(path: str) -> Level:
    if path.startswith("/undergraduate/"):
        return Level.UNDERGRADUATE
    if path.startswith("/graduate/"):
        return Level.GRADUATE
    return Level.ALL
