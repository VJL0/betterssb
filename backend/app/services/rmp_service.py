from __future__ import annotations

import logging

import httpx

from app.models.professor import RMPRating, RMPSchool

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


def _build_rmp_rating(node: dict) -> RMPRating:
    tags_raw = node.get("teacherRatingTags") or []
    top_tags = sorted(tags_raw, key=lambda t: t.get("tagCount", 0), reverse=True)

    legacy_id = node.get("legacyId", "")
    wta = node.get("wouldTakeAgainPercent")

    return RMPRating(
        professor_name=f"{node.get('firstName', '')} {node.get('lastName', '')}".strip(),
        department=node.get("department", ""),
        overall_rating=node.get("avgRating", 0.0),
        would_take_again_pct=wta if wta is not None and wta >= 0 else None,
        difficulty=node.get("avgDifficulty", 0.0),
        num_ratings=node.get("numRatings", 0),
        top_tags=[t["tagName"] for t in top_tags[:5]],
        rmp_url=(
            f"https://www.ratemyprofessors.com/professor/{legacy_id}"
            if legacy_id
            else ""
        ),
    )


class RMPService:
    """Proxy for the RateMyProfessors GraphQL API."""

    def __init__(self, auth_token: str = "") -> None:
        self._headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Referer": "https://www.ratemyprofessors.com/",
            "Origin": "https://www.ratemyprofessors.com",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/146.0.0.0 Safari/537.36"
            ),
        }
        if auth_token:
            self._headers["Authorization"] = f"Basic {auth_token}"

    async def search_schools(self, text: str) -> list[RMPSchool]:
        """Search RateMyProfessors for schools by name."""
        payload = {
            "query": SCHOOL_SEARCH_QUERY,
            "variables": {"query": {"text": text}},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    GRAPHQL_URL, json=payload, headers=self._headers
                )
                resp.raise_for_status()
                data = resp.json()

            edges = (
                data.get("data", {})
                .get("newSearch", {})
                .get("schools", {})
                .get("edges", [])
            )
            return [
                RMPSchool(
                    id=edge["node"]["id"],
                    legacy_id=edge["node"]["legacyId"],
                    name=edge["node"]["name"],
                )
                for edge in edges
                if "node" in edge
            ]
        except Exception:
            logger.exception("RMP school search failed for %r", text)
            return []

    async def search_professor(
        self,
        name: str,
        school_name: str = "",
        school_id: str = "",
    ) -> list[RMPRating]:
        """Search for professors by name, optionally scoped to a school."""
        payload = {
            "query": TEACHER_SEARCH_QUERY,
            "variables": {
                "text": name,
                "schoolID": school_id,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    GRAPHQL_URL, json=payload, headers=self._headers
                )
                resp.raise_for_status()
                data = resp.json()

            edges = (
                data.get("data", {})
                .get("newSearch", {})
                .get("teachers", {})
                .get("edges", [])
            )
            return [_build_rmp_rating(edge["node"]) for edge in edges if "node" in edge]
        except Exception:
            logger.exception("RMP search failed for %r", name)
            return []

    async def get_professor_by_id(self, rmp_id: str) -> RMPRating | None:
        """Fetch a single professor by their RMP node ID."""
        payload = {
            "query": TEACHER_BY_ID_QUERY,
            "variables": {"id": rmp_id},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    GRAPHQL_URL, json=payload, headers=self._headers
                )
                resp.raise_for_status()
                data = resp.json()

            node = data.get("data", {}).get("node")
            if not node:
                return None
            return _build_rmp_rating(node)
        except Exception:
            logger.exception("RMP lookup failed for id %r", rmp_id)
            return None
