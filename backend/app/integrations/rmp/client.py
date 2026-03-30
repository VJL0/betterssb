from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"

SCHOOL_SEARCH_QUERY = """
query NewSearchSchoolsQuery($query: SchoolSearchQuery!) {
  newSearch {
    schools(query: $query) {
      edges {
        cursor
        node {
          id
          legacyId
          name
        }
      }
    }
  }
}
"""

TEACHER_SEARCH_QUERY = """
query TeacherSearchResultsPageQuery($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}) {
      edges {
        node {
          id
          firstName
          lastName
          department
          avgRating
          wouldTakeAgainPercent
          avgDifficulty
          numRatings
          teacherRatingTags {
            tagName
            tagCount
          }
          legacyId
          school {
            name
          }
        }
      }
    }
  }
}
"""

TEACHER_BY_ID_QUERY = """
query TeacherRatingsPageQuery($id: ID!) {
  node(id: $id) {
    ... on Teacher {
      id
      firstName
      lastName
      department
      avgRating
      wouldTakeAgainPercent
      avgDifficulty
      numRatings
      teacherRatingTags {
        tagName
        tagCount
      }
      legacyId
      school {
        name
      }
    }
  }
}
"""

_DEFAULT_HEADERS: dict[str, str] = {
    "Content-Type": "application/json",
    "Referer": "https://www.ratemyprofessors.com/",
    "Origin": "https://www.ratemyprofessors.com",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0.0.0 Safari/537.36"
    ),
}


class RMPClient:
    """Low-level HTTP adapter for the RateMyProfessors GraphQL API."""

    def __init__(self, auth_token: str = "") -> None:
        self._headers = {**_DEFAULT_HEADERS}
        if auth_token:
            self._headers["Authorization"] = f"Basic {auth_token}"

    async def search_schools(self, text: str) -> list[dict]:
        payload = {
            "query": SCHOOL_SEARCH_QUERY,
            "variables": {"query": {"text": text}},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(GRAPHQL_URL, json=payload, headers=self._headers)
                resp.raise_for_status()
                data = resp.json()
            return data.get("data", {}).get("newSearch", {}).get("schools", {}).get("edges", [])
        except Exception:
            logger.exception("RMP school search failed for %r", text)
            return []

    async def search_teachers(self, name: str, school_id: str = "") -> list[dict]:
        payload = {
            "query": TEACHER_SEARCH_QUERY,
            "variables": {"text": name, "schoolID": school_id},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(GRAPHQL_URL, json=payload, headers=self._headers)
                resp.raise_for_status()
                data = resp.json()
            return data.get("data", {}).get("newSearch", {}).get("teachers", {}).get("edges", [])
        except Exception:
            logger.exception("RMP teacher search failed for %r", name)
            return []

    async def get_teacher_by_id(self, rmp_id: str) -> dict | None:
        payload = {
            "query": TEACHER_BY_ID_QUERY,
            "variables": {"id": rmp_id},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(GRAPHQL_URL, json=payload, headers=self._headers)
                resp.raise_for_status()
                data = resp.json()
            return data.get("data", {}).get("node")
        except Exception:
            logger.exception("RMP lookup failed for id %r", rmp_id)
            return None
