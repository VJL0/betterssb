"""Classifying Bulletin pages, and the pages that are mostly text.

Policies stay text: they carry exceptions and approvals that need a person to
interpret. GenEd pages become a rule set naming the attribute a course needs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from app.modules.bulletin.ingest.rules import RuleNodeDraft, clean_text
from app.modules.bulletin.models import PageKind, ParseStatus, RuleNodeType

# "(GA)" in "Arts (GA)", "(GY & GZ)" in "Intellectual Heritage (GY & GZ)"
GENED_CODES = re.compile(r"\((?P<first>G[A-Z])(?:\s*[-/&]\s*(?P<second>G[A-Z]))?\)")
# "One 3-credit hour course." / "Two 3-credit hour courses."
GENED_COUNT = re.compile(r"^(?P<count>one|two|three)\b", re.IGNORECASE)
COUNT_WORDS = {"one": 1, "two": 2, "three": 3}
GENED_REQUIREMENT = re.compile(r"Requirement:\s*(?P<text>[^.]*\.)")
POLICY_NUMBER = re.compile(r"Policy\s*#\s*(?P<number>[0-9.]+[0-9])")
# A policy's own number follows its heading; later ones cite other policies.
POLICY_NUMBER_WINDOW = 300
CONTENT_SELECTOR = "#contentarea"
ARCHIVE_PREFIX = re.compile(r"^/archives/[0-9]{4}-[0-9]{4}")

COURSES_PATH = "/undergraduate/courses/"
GENED_PATH = "/undergraduate/general-education/"
POLICIES_PATH = "/undergraduate/academic-policies/"
PROGRAM_INDEX_PATH = "/academic-programs/"


def edition_path(url: str) -> str:
    """The URL's path within its edition: archives and current share one layout."""
    return ARCHIVE_PREFIX.sub("", urlsplit(url).path)


def page_slug(url: str) -> str:
    return edition_path(url).rstrip("/").rsplit("/", 1)[-1]


def classify_page(path: str, program_paths: set[str]) -> PageKind:
    if path in program_paths:
        return PageKind.PROGRAM
    if path == PROGRAM_INDEX_PATH:
        return PageKind.PROGRAM_INDEX
    if path.startswith(COURSES_PATH) and path != COURSES_PATH:
        return PageKind.COURSE_SUBJECT
    if path.startswith(GENED_PATH):
        return PageKind.GENERAL_EDUCATION
    if path.startswith(POLICIES_PATH) and path != POLICIES_PATH:
        return PageKind.POLICY
    return PageKind.OTHER


def page_title(soup: BeautifulSoup) -> str:
    heading = soup.select_one("h1.page-title")
    return clean_text(heading.get_text(" ")) if heading else ""


def main_text(soup: BeautifulSoup) -> str:
    """Every tab's text, hidden ones too: the server sends them all."""
    content = soup.select_one(CONTENT_SELECTOR) or soup.body or soup
    return clean_text(content.get_text(" "))


@dataclass(slots=True)
class PolicyDraft:
    title: str
    policy_number: str
    body_text: str


@dataclass(slots=True)
class GenEdDraft:
    title: str
    codes: list[str]
    tree: RuleNodeDraft
    body_text: str


def parse_policy_page(html: str) -> PolicyDraft:
    soup = BeautifulSoup(html, "lxml")
    return policy_from_text(page_title(soup), main_text(soup))


def policy_from_text(title: str, body_text: str) -> PolicyDraft:
    match = POLICY_NUMBER.search(body_text[:POLICY_NUMBER_WINDOW])
    return PolicyDraft(title, match["number"] if match else "", body_text)


def parse_gened_page(html: str) -> GenEdDraft | None:
    """A GenEd area page; None for the GenEd overview, which names no one area."""
    soup = BeautifulSoup(html, "lxml")
    title = page_title(soup)
    codes_match = GENED_CODES.search(title)
    if not codes_match:
        return None
    codes = [code for code in codes_match.group("first", "second") if code]
    body = main_text(soup)
    requirement = GENED_REQUIREMENT.search(body)
    requirement_text = clean_text(requirement["text"]) if requirement else ""
    count = GENED_COUNT.match(requirement_text)
    if len(codes) == 1:
        # "Two 3-credit hour courses": that many courses with the attribute.
        tree = RuleNodeDraft(
            RuleNodeType.ATTRIBUTE,
            label=title,
            source_text=requirement_text or title,
            attribute=codes[0],
            min_count=COUNT_WORDS[count["count"].lower()] if count else None,
            parse_status=ParseStatus.COMPLETE if count else ParseStatus.PARTIAL,
        )
    else:
        # Intellectual Heritage I and II: one course of each, in its own words.
        tree = RuleNodeDraft(
            RuleNodeType.ALL,
            label=title,
            source_text=requirement_text or title,
            children=[
                RuleNodeDraft(
                    RuleNodeType.ATTRIBUTE,
                    label=code,
                    source_text=title,
                    attribute=code,
                    min_count=1,
                )
                for code in codes
            ],
            parse_status=ParseStatus.PARTIAL,
        )
    return GenEdDraft(title, codes, tree, body)
