"""Parsed requirement trees, before they're written as `rule_nodes`."""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.modules.bulletin.models import ParseStatus, RuleNodeType

SUBJECT = r"[A-Z]{2,5}"
# Numbers are four digits, or a letter and three digits for placeholders (BIOL A000).
COURSE_CODE = re.compile(rf"\b({SUBJECT}) ([0-9]{{4}}|[A-Z][0-9]{{3}})\b")


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


@dataclass(slots=True)
class RuleNodeDraft:
    node_type: RuleNodeType
    label: str = ""
    source_text: str = ""
    children: list[RuleNodeDraft] = field(default_factory=list)
    # A course node's (subject, number).
    course: tuple[str, str] | None = None
    attribute: str | None = None
    min_count: int | None = None
    min_credits: Decimal | None = None
    max_credits: Decimal | None = None
    params: dict[str, Any] = field(default_factory=dict)
    parse_status: ParseStatus = ParseStatus.COMPLETE

    def walk(self) -> Iterator[RuleNodeDraft]:
        yield self
        for child in self.children:
            yield from child.walk()

    def tree_status(self) -> ParseStatus:
        statuses = {node.parse_status for node in self.walk()}
        if statuses == {ParseStatus.RAW}:
            return ParseStatus.RAW
        if statuses == {ParseStatus.COMPLETE}:
            return ParseStatus.COMPLETE
        return ParseStatus.PARTIAL


def course_node(subject: str, number: str, source_text: str = "", **params: Any):
    return RuleNodeDraft(
        RuleNodeType.COURSE,
        label=f"{subject} {number}",
        source_text=source_text or f"{subject} {number}",
        course=(subject, number),
        params=params,
    )


def text_node(source_text: str, **kwargs: Any) -> RuleNodeDraft:
    return RuleNodeDraft(
        RuleNodeType.TEXT,
        label=source_text,
        source_text=source_text,
        parse_status=ParseStatus.RAW,
        **kwargs,
    )
