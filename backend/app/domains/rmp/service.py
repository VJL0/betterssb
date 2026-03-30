from __future__ import annotations

from app.domains.rmp.schemas import RMPRating, RMPSchool
from app.integrations.rmp.client import RMPClient


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
        rmp_url=(f"https://www.ratemyprofessors.com/professor/{legacy_id}" if legacy_id else ""),
    )


class RMPService:
    """High-level service for RateMyProfessors data."""

    def __init__(self, auth_token: str = "") -> None:
        self._client = RMPClient(auth_token=auth_token)

    async def search_schools(self, text: str) -> list[RMPSchool]:
        """Search RateMyProfessors for schools by name."""
        edges = await self._client.search_schools(text)
        return [
            RMPSchool(
                id=edge["node"]["id"],
                legacy_id=edge["node"]["legacyId"],
                name=edge["node"]["name"],
            )
            for edge in edges
            if "node" in edge
        ]

    async def search_professor(
        self,
        name: str,
        school_name: str = "",
        school_id: str = "",
    ) -> list[RMPRating]:
        """Search for professors by name, optionally scoped to a school."""
        edges = await self._client.search_teachers(name, school_id=school_id)
        return [_build_rmp_rating(edge["node"]) for edge in edges if "node" in edge]

    async def get_professor_by_id(self, rmp_id: str) -> RMPRating | None:
        """Fetch a single professor by their RMP node ID."""
        node = await self._client.get_teacher_by_id(rmp_id)
        if not node:
            return None
        return _build_rmp_rating(node)
