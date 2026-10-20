from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from app.core.cache import ONE_DAY_SECONDS, Cache, cache_claim, cache_get, cache_set
from app.modules.rmp.client import RMPClient, RMPUnavailable
from app.modules.rmp.schemas import RMPRating
from app.shared.schemas import BaseSchema

logger = logging.getLogger(__name__)

ROSTER_KEY = "rmp:roster"
SYNC_CLAIM_KEY = "rmp:roster:sync"
# Ratings move slowly; one pass over Temple's ~7 roster pages a day is plenty.
SYNC_EVERY = timedelta(days=1)
# Keep serving the last roster through a few days of failed syncs.
ROSTER_TTL_SECONDS = 3 * ONE_DAY_SECONDS
# One process syncs at a time. The claim outlives the sync, so after a failure
# the next attempt waits this long, and it lapses if a process dies mid-sync.
SYNC_CLAIM_SECONDS = 30 * 60
# Space out roster pages to go easy on RateMyProfessors.
PAGE_PAUSE_SECONDS = 3.0
# How often a process picks up a roster another process synced, and how long it
# waits before a lookup may start another sync attempt.
RELOAD_EVERY_SECONDS = 10 * 60
TOP_TAGS = 5

Sleep = Callable[[float], Awaitable[None]]


class RosterProfessor(BaseSchema):
    first_name: str
    last_name: str
    rating: RMPRating


class Roster(BaseSchema):
    synced_at: datetime
    professors: list[RosterProfessor]


def _build_rmp_rating(node: dict, first: str, last: str) -> RMPRating:
    tags_raw = node.get("teacherRatingTags") or []
    top_tags = sorted(tags_raw, key=lambda t: t.get("tagCount", 0), reverse=True)

    legacy_id = node.get("legacyId", "")
    wta = node.get("wouldTakeAgainPercent")

    return RMPRating(
        professor_name=f"{first} {last}".strip(),
        department=(node.get("department") or "").strip(),
        overall_rating=node.get("avgRating", 0.0),
        would_take_again_pct=wta if wta is not None and wta >= 0 else None,
        difficulty=node.get("avgDifficulty", 0.0),
        num_ratings=node.get("numRatings", 0),
        top_tags=[t["tagName"] for t in top_tags[:TOP_TAGS]],
        rmp_url=(
            f"https://www.ratemyprofessors.com/professor/{legacy_id}"
            if legacy_id
            else ""
        ),
    )


def _roster_professor(node: dict) -> RosterProfessor:
    # RateMyProfessors keeps names as students typed them ("Alexa ").
    first = (node.get("firstName") or "").strip()
    last = (node.get("lastName") or "").strip()
    return RosterProfessor(
        first_name=first, last_name=last, rating=_build_rmp_rating(node, first, last)
    )


def _name_words(name: str) -> list[str]:
    """Lowercase ASCII words, so "José Núñez-Ruiz" and "Jose Nunez Ruiz" agree."""
    plain = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    return re.findall(r"[a-z]+", plain.lower())


def _first_name_fits(query: list[str], professor: RosterProfessor) -> bool:
    """Loose on purpose ("Chris" for "Christopher"): clients pick the exact
    profile with `isSameInstructor`."""
    last = set(_name_words(professor.last_name))
    others = [word for word in query if word not in last]
    first = _name_words(professor.first_name)
    if not others or not first:
        return True
    return any(w.startswith(first[0]) or first[0].startswith(w) for w in others)


class _ProfessorIndex:
    """Temple's professors by each word of their last name."""

    def __init__(self, roster: Roster) -> None:
        self.synced_at = roster.synced_at
        self._by_last_word: dict[str, list[RosterProfessor]] = defaultdict(list)
        for professor in roster.professors:
            for word in set(_name_words(professor.last_name)):
                self._by_last_word[word].append(professor)

    def find(self, name: str) -> list[RMPRating]:
        query = _name_words(name)
        # Keyed by identity, so a professor found by two words appears once.
        found: dict[int, RMPRating] = {}
        for word in query:
            for professor in self._by_last_word.get(word, []):
                if _first_name_fits(query, professor):
                    found[id(professor)] = professor.rating
        return list(found.values())


def _due(last: float | None) -> bool:
    """Whether it's been `RELOAD_EVERY_SECONDS` since `last`, or there was no last."""
    return last is None or time.monotonic() - last >= RELOAD_EVERY_SECONDS


def _is_fresh(index: _ProfessorIndex | None) -> bool:
    return index is not None and datetime.now(UTC) - index.synced_at < SYNC_EVERY


class RMPRosterService:
    """Temple's RateMyProfessors roster, searched in memory.

    A lookup that finds no roster, or one a day old, starts a sync in the
    background and answers from what's there; it never waits on
    RateMyProfessors. One process syncs and stores the roster in the cache, and
    every process keeps its own copy in memory.
    """

    def __init__(
        self,
        client: RMPClient,
        cache: Cache | None,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._client = client
        self._cache = cache
        self._sleep = sleep
        self._index: _ProfessorIndex | None = None
        # time.monotonic() values, None until the first time.
        self._checked_at: float | None = None
        self._sync_started_at: float | None = None
        self._sync_task: asyncio.Task[None] | None = None

    async def search(self, name: str) -> list[RMPRating]:
        """Professors whose name could be `name` ("First Last").

        Raises `RMPUnavailable` until the first sync finishes.
        """
        index = await self._current_index()
        if not _is_fresh(index):
            self._start_sync()
        if index is None:
            raise RMPUnavailable
        return index.find(name)

    def _start_sync(self) -> None:
        # Each attempt re-reads the roster from the cache, so while RMP is down
        # a busy process tries now and then, not on every lookup.
        if not _due(self._sync_started_at):
            return
        self._sync_started_at = time.monotonic()
        self._sync_task = asyncio.create_task(self._sync_in_background())

    async def _sync_in_background(self) -> None:
        try:
            await self.sync_if_due()
        except Exception:
            logger.exception("RMP roster sync failed; a later lookup retries")

    async def sync_if_due(self) -> None:
        # Another process may have synced since this one last looked.
        if _is_fresh(await self._current_index(force=True)):
            return
        if await cache_claim(self._cache, SYNC_CLAIM_KEY, SYNC_CLAIM_SECONDS):
            await self.sync()

    async def sync(self) -> None:
        professors: list[RosterProfessor] = []
        cursor: str | None = None
        while True:
            page = await self._client.roster_page(after=cursor)
            professors += [_roster_professor(node) for node in page.professors]
            cursor = page.next_cursor
            if cursor is None:
                break
            await self._sleep(PAGE_PAUSE_SECONDS)
        roster = Roster(synced_at=datetime.now(UTC), professors=professors)
        await cache_set(
            self._cache, ROSTER_KEY, roster.model_dump_json(), ROSTER_TTL_SECONDS
        )
        self._index = _ProfessorIndex(roster)
        logger.info("Synced %d Temple professors from RMP", len(professors))

    async def _current_index(self, force: bool = False) -> _ProfessorIndex | None:
        if force or _due(self._checked_at):
            # Marked first, so requests that arrive during the reload don't repeat it.
            self._checked_at = time.monotonic()
            await self._load_newer()
        return self._index

    async def _load_newer(self) -> None:
        stored = await cache_get(self._cache, ROSTER_KEY)
        if not stored:
            return
        roster = Roster.model_validate_json(stored)
        if self._index is None or roster.synced_at > self._index.synced_at:
            self._index = _ProfessorIndex(roster)
