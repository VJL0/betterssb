"""Parse Bulletin course descriptions (CourseLeaf course blocks).

The same block appears in a subject's course list
(`/undergraduate/courses/cis/`) and in the popup a course link opens,
which CourseLeaf serves as XML wrapping the block's HTML
(`/ribbit/index.cgi?page=getcourse.rjs&code=CIS%203296`).
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from app.modules.degree.bulletin_html import COURSE_CODE_RE, clean, full_url, text
from app.modules.degree.schemas import CourseDescription, Fact

# "CIS 3296. Software Design. 4 Credit Hours." or "… 1 to 4 Credit Hours."
_TITLE_RE = re.compile(
    r"^(?P<code>[A-Z]{2,5}\s+\d{4}[A-Z]?)\.\s+(?P<title>.+?)\.\s+"
    r"(?P<credits>[\d.]+(?:\s*(?:to|or|-)\s*[\d.]+)?)\s+Credit Hours?\.?$"
)
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)
_ATTRIBUTES = "course attributes"
_REPEATABILITY = "repeatability"
_PREREQUISITES = "pre-requisites"
_COREQUISITES = "co-requisites"
_RESTRICTIONS = "restrictions"
_COURSE_SEARCH_PATH = "/search/?P="


def parse_course_blocks(page: str) -> list[CourseDescription]:
    """Every course block in a page, or in a course popup's XML."""
    html = "".join(_CDATA_RE.findall(page)) or page
    soup = BeautifulSoup(html, "lxml")
    return [
        course for block in soup.select(".courseblock") if (course := _course(block))
    ]


def _course(block: Tag) -> CourseDescription | None:
    heading = text(block.select_one(".courseblocktitle"))
    match = _TITLE_RE.match(heading)
    if not match:
        return None
    code = clean(match["code"])
    course = CourseDescription(
        code=code,
        title=match["title"].strip(),
        credits=match["credits"].replace(" to ", "-").strip(),
        description=text(block.select_one(".courseblockheaddiv"))
        or text(block.select_one(".courseblockdesc"), skip=frozenset({"p"})),
        bulletin_url=full_url(f"{_COURSE_SEARCH_PATH}{code.replace(' ', '%20')}"),
    )
    for part in block.select(".courseblockpart, .courseblockextra"):
        for label, value, codes in _labelled(part):
            key = label.lower()
            if key == _ATTRIBUTES:
                course.attributes = [
                    a for a in (clean(v) for v in value.split(",")) if a
                ]
            elif key == _REPEATABILITY:
                course.repeatability = value
            elif key == _PREREQUISITES:
                course.prerequisites = value
                course.prerequisite_courses = codes
            elif key == _COREQUISITES:
                course.corequisites = value
                course.corequisite_courses = codes
            elif key.endswith(_RESTRICTIONS):
                course.restrictions.append(Fact(tab="", label=label, value=value))
            else:
                course.other.append(Fact(tab="", label=label, value=value))
    return course


def _labelled(part: Tag) -> list[tuple[str, str, list[str]]]:
    """A part's "Label: value" pairs; one part can hold several ("Department Restrictions: … Field of Study Restrictions: …")."""
    pairs: list[tuple[str, str, list[str]]] = []
    for strong in part.find_all("strong"):
        label = clean(strong.get_text()).rstrip(":").strip()
        value_nodes = []
        for sibling in strong.next_siblings:
            if isinstance(sibling, Tag) and sibling.name == "strong":
                break
            value_nodes.append(sibling)
        fragment = BeautifulSoup("".join(str(n) for n in value_nodes), "lxml")
        value = text(fragment.body or fragment)
        # The popup writes course codes as plain text; course pages link them.
        codes = [f"{s} {n}" for s, n in COURSE_CODE_RE.findall(value)]
        pairs.append((label, value, list(dict.fromkeys(codes))))
    return pairs
