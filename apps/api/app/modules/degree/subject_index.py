"""Parse a Bulletin's course descriptions index (`/courses/`): one link per subject."""

from __future__ import annotations

import re

from bs4 import BeautifulSoup

from app.modules.degree.bulletin_html import clean
from app.modules.degree.schemas import CodeName

# "Computer & Information Science (CIS)"; some names carry their own
# parentheses ("Anatomy & Cell Biology (Medical School) (ANAT)").
_SUBJECT_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<code>[A-Z]{2,5})\)$")


def parse_subject_index(html: str) -> list[CodeName]:
    """Every subject the index links to, in the index's (alphabetical) order."""
    soup = BeautifulSoup(html, "lxml")
    subjects: dict[str, CodeName] = {}
    for link in soup.select(".sitemap a.sitemaplink"):
        match = _SUBJECT_RE.match(clean(link.get_text()))
        if match and match["code"] not in subjects:
            subjects[match["code"]] = CodeName(code=match["code"], name=match["name"])
    return list(subjects.values())
