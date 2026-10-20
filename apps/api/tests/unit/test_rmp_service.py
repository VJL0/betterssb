from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.modules.rmp.client import RMPUnavailable, RosterPage
from app.modules.rmp.service import (
    PAGE_PAUSE_SECONDS,
    ROSTER_KEY,
    ROSTER_TTL_SECONDS,
    RMPRosterService,
    Roster,
)
from tests.unit.test_class_search import MemoryCache


def professor(first: str, last: str, **fields) -> dict:
    return {
        "firstName": first,
        "lastName": last,
        "department": "Computer Science",
        "avgRating": 4.5,
        "avgDifficulty": 3.0,
        "numRatings": 12,
        "wouldTakeAgainPercent": 90,
        "legacyId": 123,
        "teacherRatingTags": [],
        **fields,
    }


class FakeRMP:
    """Stands in for `RMPClient`, serving the roster in pages."""

    def __init__(self, pages: list[list[dict]], down: bool = False) -> None:
        self.pages = pages
        self.down = down
        self.requests: list[str | None] = []

    async def roster_page(self, after: str | None = None) -> RosterPage:
        self.requests.append(after)
        if self.down:
            raise RMPUnavailable
        index = 0 if after is None else int(after)
        last = index == len(self.pages) - 1
        return RosterPage(self.pages[index], None if last else str(index + 1))


ROSTER = [
    [
        professor(
            "Christopher",
            "Pascucci",
            legacyId=7,
            teacherRatingTags=[
                {"tagName": "Caring", "tagCount": 2},
                {"tagName": "Tough grader", "tagCount": 9},
            ],
        ),
        professor("Alexa ", "Firat"),
    ],
    [professor("Cindy", "Liao"), professor("José", "Núñez-Ruiz")],
]


class Sleeps:
    def __init__(self) -> None:
        self.calls: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def roster_service(
    rmp: FakeRMP, cache: MemoryCache | None = None
) -> tuple[RMPRosterService, Sleeps]:
    sleeps = Sleeps()
    return RMPRosterService(rmp, cache, sleep=sleeps), sleeps


class TestSync:
    async def test_reads_every_page_with_a_pause_between(self):
        rmp = FakeRMP(ROSTER)
        cache = MemoryCache()
        service, sleeps = roster_service(rmp, cache)

        await service.sync()

        assert rmp.requests == [None, "1"]
        assert sleeps.calls == [PAGE_PAUSE_SECONDS]
        assert cache.ttls == {ROSTER_KEY: ROSTER_TTL_SECONDS}
        assert len(Roster.model_validate_json(cache.values[ROSTER_KEY]).professors) == 4

    async def test_builds_ratings(self):
        service, _ = roster_service(FakeRMP(ROSTER))
        await service.sync()

        [rating] = await service.search("Christopher Pascucci")
        assert rating.professor_name == "Christopher Pascucci"
        assert rating.rmp_url == "https://www.ratemyprofessors.com/professor/7"
        assert rating.top_tags == ["Tough grader", "Caring"]
        assert (await service.search("Alexa Firat"))[0].professor_name == "Alexa Firat"

    async def test_a_failed_sync_keeps_the_last_roster(self):
        rmp = FakeRMP(ROSTER)
        cache = MemoryCache()
        service, _ = roster_service(rmp, cache)
        await service.sync()
        stored = cache.values[ROSTER_KEY]

        rmp.down = True
        with pytest.raises(RMPUnavailable):
            await service.sync()

        assert cache.values[ROSTER_KEY] == stored
        assert len(await service.search("Cindy Liao")) == 1


class TestSyncIfDue:
    async def test_syncs_when_nothing_is_stored(self):
        rmp = FakeRMP(ROSTER)
        service, _ = roster_service(rmp, MemoryCache())
        await service.sync_if_due()
        assert rmp.requests == [None, "1"]

    async def test_skips_a_roster_synced_today(self):
        cache = MemoryCache()
        await roster_service(FakeRMP(ROSTER), cache)[0].sync()

        rmp = FakeRMP(ROSTER)
        await roster_service(rmp, cache)[0].sync_if_due()

        assert rmp.requests == []

    async def test_resyncs_a_day_old_roster(self):
        cache = MemoryCache()
        old = Roster(
            synced_at=datetime.now(UTC) - timedelta(days=1, minutes=1), professors=[]
        )
        cache.values[ROSTER_KEY] = old.model_dump_json()

        rmp = FakeRMP(ROSTER)
        await roster_service(rmp, cache)[0].sync_if_due()

        assert rmp.requests == [None, "1"]

    async def test_only_one_process_syncs(self):
        cache = MemoryCache()
        first, second = FakeRMP(ROSTER), FakeRMP(ROSTER)
        cache.values["rmp:roster:sync"] = "1"  # Another process is syncing.

        await roster_service(first, cache)[0].sync_if_due()
        assert first.requests == []
        del cache.values["rmp:roster:sync"]
        await roster_service(second, cache)[0].sync_if_due()
        assert second.requests == [None, "1"]


async def finish_background_sync(service: RMPRosterService) -> None:
    if service._sync_task:
        await service._sync_task


async def store_day_old_roster(cache: MemoryCache) -> None:
    await roster_service(FakeRMP(ROSTER), cache)[0].sync()
    roster = Roster.model_validate_json(cache.values[ROSTER_KEY])
    old = roster.model_copy(
        update={"synced_at": datetime.now(UTC) - timedelta(days=1, minutes=1)}
    )
    cache.values[ROSTER_KEY] = old.model_dump_json()


class TestSyncOnLookup:
    async def test_first_lookup_starts_a_sync_and_answers_once_it_finishes(self):
        rmp = FakeRMP(ROSTER)
        service, _ = roster_service(rmp, MemoryCache())

        with pytest.raises(RMPUnavailable):
            await service.search("Cindy Liao")
        await finish_background_sync(service)

        assert rmp.requests == [None, "1"]
        assert len(await service.search("Cindy Liao")) == 1

    async def test_serves_a_day_old_roster_while_it_resyncs(self):
        cache = MemoryCache()
        await store_day_old_roster(cache)
        rmp = FakeRMP(ROSTER)
        service, _ = roster_service(rmp, cache)

        assert len(await service.search("Cindy Liao")) == 1
        await finish_background_sync(service)

        assert rmp.requests == [None, "1"]
        synced = Roster.model_validate_json(cache.values[ROSTER_KEY]).synced_at
        assert datetime.now(UTC) - synced < timedelta(minutes=1)

    async def test_a_fresh_roster_doesnt_sync(self):
        cache = MemoryCache()
        await roster_service(FakeRMP(ROSTER), cache)[0].sync()
        rmp = FakeRMP(ROSTER)
        service, _ = roster_service(rmp, cache)

        await service.search("Cindy Liao")
        await finish_background_sync(service)

        assert rmp.requests == []

    async def test_during_an_outage_lookups_dont_retry_every_time(self):
        rmp = FakeRMP(ROSTER, down=True)
        service, _ = roster_service(rmp, None)

        for _ in range(3):
            with pytest.raises(RMPUnavailable):
                await service.search("Cindy Liao")
            await finish_background_sync(service)

        assert rmp.requests == [None]


class TestSearch:
    async def test_reads_a_roster_another_process_synced(self):
        cache = MemoryCache()
        await roster_service(FakeRMP(ROSTER), cache)[0].sync()

        reader, _ = roster_service(FakeRMP([]), cache)
        assert len(await reader.search("Cindy Liao")) == 1

    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Chris Pascucci", ["Christopher Pascucci"]),
            ("cindy  LIAO", ["Cindy Liao"]),
            ("Jose Nunez", ["José Núñez-Ruiz"]),
            ("Maria Pascucci", []),
            ("Cindy Li", []),
            ("Pascucci", ["Christopher Pascucci"]),
        ],
    )
    async def test_matches_by_last_name_and_first_name_prefix(
        self, name: str, expected: list[str]
    ):
        service, _ = roster_service(FakeRMP(ROSTER))
        await service.sync()
        assert [r.professor_name for r in await service.search(name)] == expected
