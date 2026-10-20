from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
REQUEST_TIMEOUT_SECONDS = 30.0
# RateMyProfessors' own pages ask for 10 at a time; 1000 is the most it serves.
ROSTER_PAGE_SIZE = 1000

# Temple University's main campus in Philadelphia on RateMyProfessors (legacy id
# 999). The other "Temple University" schools there are separate campuses.
TEMPLE_SCHOOL_ID = "U2Nob29sLTk5OQ=="

# An empty search lists every professor at the school, a page at a time.
ROSTER_PAGE_QUERY = """
query TempleRosterPage($schoolID: ID!, $first: Int!, $after: String) {
  newSearch {
    teachers(query: {text: "", schoolID: $schoolID}, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          legacyId
          firstName
          lastName
          department
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
          teacherRatingTags {
            tagName
            tagCount
          }
        }
      }
    }
  }
}
"""

_HEADERS: dict[str, str] = {
    "Content-Type": "application/json",
    "Referer": "https://www.ratemyprofessors.com/",
    "Origin": "https://www.ratemyprofessors.com",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0.0.0 Safari/537.36"
    ),
}


class RMPUnavailable(Exception):
    """RateMyProfessors couldn't answer: a network error, an error status or a bad body."""


@dataclass(frozen=True)
class RosterPage:
    professors: list[dict]
    next_cursor: str | None


class RMPClient:
    """Low-level HTTP adapter for the RateMyProfessors GraphQL API."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def roster_page(self, after: str | None = None) -> RosterPage:
        """One page of Temple's professors; `after` is the previous page's cursor."""
        payload = {
            "query": ROSTER_PAGE_QUERY,
            "variables": {
                "schoolID": TEMPLE_SCHOOL_ID,
                "first": ROSTER_PAGE_SIZE,
                "after": after,
            },
        }
        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                resp = await client.post(GRAPHQL_URL, json=payload, headers=_HEADERS)
                resp.raise_for_status()
                teachers = resp.json()["data"]["newSearch"]["teachers"]
            page_info = teachers["pageInfo"]
            return RosterPage(
                professors=[edge["node"] for edge in teachers["edges"]],
                next_cursor=(
                    page_info["endCursor"] if page_info["hasNextPage"] else None
                ),
            )
        except Exception as exc:
            logger.exception("RMP roster page after %r failed", after)
            raise RMPUnavailable from exc
