"""Seat watches over HTTP: a signed-in student's CRNs, and the scheduled check
that emails them. Banner and Gmail are faked.
"""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.main import app
from app.modules.auth import service as auth_service
from app.modules.seat_tracker import router as seat_router
from app.modules.seat_tracker.client import BannerSectionClient
from app.modules.seat_tracker.mailer import Email, MailError
from app.modules.seat_tracker.service import MAX_WATCHES_PER_USER
from tests.unit.test_seat_tracker_client import DETAILS_FRAGMENT, enrollment_fragment

SESSION_COOKIE = "__Host-Http-sid"
CRON_SECRET = "test-cron-secret-0123456789"
TERM = "202703"
CRN = "50067"


class FakeBanner:
    """Banner's class detail and enrollment fragments, with seats set per CRN."""

    def __init__(self) -> None:
        self.seats: dict[str, int] = {}
        self.down = False

    def client(self) -> BannerSectionClient:
        return BannerSectionClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            return httpx.Response(503)
        crn = dict(httpx.QueryParams(request.content.decode()))["courseReferenceNumber"]
        if crn not in self.seats:
            return httpx.Response(200, text="<section></section>")
        if request.url.path.endswith("getClassDetails"):
            return httpx.Response(200, text=DETAILS_FRAGMENT)
        return httpx.Response(200, text=enrollment_fragment(seats=self.seats[crn]))


class FakeMailer:
    def __init__(self) -> None:
        self.sent: list[Email] = []
        self.failing = False

    async def send(self, email: Email) -> None:
        if self.failing:
            raise MailError("Gmail down")
        self.sent.append(email)


@pytest.fixture()
def banner() -> Iterator[FakeBanner]:
    fake = FakeBanner()
    app.dependency_overrides[seat_router.get_banner_client] = fake.client
    yield fake
    app.dependency_overrides.pop(seat_router.get_banner_client, None)


@pytest.fixture()
def mailer(monkeypatch: pytest.MonkeyPatch) -> FakeMailer:
    fake = FakeMailer()
    monkeypatch.setattr(seat_router, "create_mailer", lambda _settings: fake)
    monkeypatch.setattr(app.state.settings, "CRON_SECRET", CRON_SECRET)
    return fake


async def sign_in_as(
    client: AsyncClient, db: async_sessionmaker, *, sub: str, email: str
) -> None:
    async with db() as session:
        token = await auth_service.start_session(
            session, {"sub": sub, "email": email, "name": "Test Student"}
        )
    client.cookies.set(SESSION_COOKIE, token)


@pytest.fixture()
async def student(client: AsyncClient, db: async_sessionmaker) -> AsyncClient:
    await sign_in_as(client, db, sub="google-sub-1", email="student@gmail.com")
    return client


async def watch(client: AsyncClient, crn: str = CRN) -> httpx.Response:
    return await client.post("/api/seat-watches", json={"term": TERM, "crn": crn})


async def run_check(client: AsyncClient) -> httpx.Response:
    return await client.get(
        "/api/seat-watches/check",
        headers={"Authorization": f"Bearer {CRON_SECRET}"},
    )


class TestWatches:
    async def test_needs_a_signed_in_student(self, client: AsyncClient, db):
        assert (await client.get("/api/seat-watches")).status_code == 401
        assert (await watch(client)).status_code == 401

    async def test_watching_a_crn_shows_its_class(self, student, banner):
        banner.seats[CRN] = 0

        created = await watch(student)

        assert created.status_code == 201
        body = created.json()
        assert body["title"] == "Software Security"
        assert body["subject"] == "Computer & Information Science"
        assert (body["courseNumber"], body["section"]) == ("3441", "702")
        assert (body["seatsAvailable"], body["maximumEnrollment"]) == (0, 30)
        assert body["waitCount"] == 15
        assert body["notifiedAt"] is None
        listed = (await student.get("/api/seat-watches")).json()
        assert [w["crn"] for w in listed] == [CRN]

    async def test_a_crn_banner_doesnt_have_is_not_found(self, student, banner):
        resp = await watch(student, "99999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "There's no CRN 99999 in this term."

    async def test_the_same_crn_twice_conflicts(self, student, banner):
        banner.seats[CRN] = 0
        await watch(student)
        resp = await watch(student)
        assert resp.status_code == 409

    async def test_watches_are_capped(self, student, banner):
        crns = [str(10000 + n) for n in range(MAX_WATCHES_PER_USER + 1)]
        banner.seats.update(dict.fromkeys(crns, 0))
        for crn in crns[:-1]:
            assert (await watch(student, crn)).status_code == 201
        assert (await watch(student, crns[-1])).status_code == 409

    async def test_banner_down_is_a_bad_gateway(self, student, banner):
        banner.down = True
        assert (await watch(student)).status_code == 502

    async def test_a_crn_must_be_five_digits(self, student, banner):
        resp = await student.post(
            "/api/seat-watches", json={"term": TERM, "crn": "123"}
        )
        assert resp.status_code == 422

    async def test_removing_a_watch(self, student, banner):
        banner.seats[CRN] = 0
        watch_id = (await watch(student)).json()["id"]

        assert (
            await student.delete(f"/api/seat-watches/{watch_id}")
        ).status_code == 204
        assert (await student.get("/api/seat-watches")).json() == []
        assert (
            await student.delete(f"/api/seat-watches/{watch_id}")
        ).status_code == 404

    async def test_students_only_see_their_own(self, student, db, banner):
        banner.seats[CRN] = 0
        watch_id = (await watch(student)).json()["id"]

        await sign_in_as(student, db, sub="google-sub-2", email="other@gmail.com")

        assert (await student.get("/api/seat-watches")).json() == []
        assert (
            await student.delete(f"/api/seat-watches/{watch_id}")
        ).status_code == 404


class TestCheck:
    async def test_needs_the_cron_secret(self, client: AsyncClient, db, mailer):
        resp = await client.get(
            "/api/seat-watches/check", headers={"Authorization": "Bearer wrong"}
        )
        assert resp.status_code == 401

    async def test_is_off_without_a_cron_secret(self, client: AsyncClient, db):
        assert app.state.settings.CRON_SECRET == ""
        assert (await run_check(client)).status_code == 503

    async def test_emails_the_student_when_a_full_section_opens(
        self, student, banner, mailer
    ):
        banner.seats[CRN] = 0
        await watch(student)

        banner.seats[CRN] = 2
        resp = await run_check(student)

        assert resp.json() == {"sections": 1, "failed": 0, "emailed": 1}
        [email] = mailer.sent
        assert email.to == "student@gmail.com"
        assert email.subject == f"Seat open: Software Security (CRN {CRN})"
        assert "2 seats are open" in email.text
        [listed] = (await student.get("/api/seat-watches")).json()
        assert listed["seatsAvailable"] == 2
        assert listed["notifiedAt"] is not None

    async def test_emails_once_while_it_stays_open_and_again_after_it_fills(
        self, student, banner, mailer
    ):
        banner.seats[CRN] = 0
        await watch(student)

        for seats in (1, 3, 0, 1):
            banner.seats[CRN] = seats
            await run_check(student)

        assert len(mailer.sent) == 2

    async def test_a_section_open_when_added_sends_nothing(
        self, student, banner, mailer
    ):
        banner.seats[CRN] = 4
        await watch(student)

        await run_check(student)

        assert mailer.sent == []

    async def test_a_failed_email_is_retried_next_run(self, student, banner, mailer):
        banner.seats[CRN] = 0
        await watch(student)
        banner.seats[CRN] = 1

        mailer.failing = True
        assert (await run_check(student)).json()["emailed"] == 0
        mailer.failing = False
        assert (await run_check(student)).json()["emailed"] == 1

    async def test_banner_failing_keeps_the_last_counts(self, student, banner, mailer):
        banner.seats[CRN] = 0
        await watch(student)

        banner.down = True
        resp = await run_check(student)

        assert resp.json() == {"sections": 1, "failed": 1, "emailed": 0}
        [listed] = (await student.get("/api/seat-watches")).json()
        assert listed["seatsAvailable"] == 0

    async def test_one_banner_read_per_section_for_every_student(
        self, student, db, banner, mailer
    ):
        banner.seats[CRN] = 0
        await watch(student)
        await sign_in_as(student, db, sub="google-sub-2", email="other@gmail.com")
        await watch(student)

        banner.seats[CRN] = 1
        resp = await run_check(student)

        assert resp.json()["sections"] == 1
        assert sorted(m.to for m in mailer.sent) == [
            "other@gmail.com",
            "student@gmail.com",
        ]

    async def test_stays_out_of_the_openapi_schema(self, client: AsyncClient):
        paths = (await client.get("/openapi.json")).json()["paths"]
        assert "/api/seat-watches" in paths
        assert "/api/seat-watches/check" not in paths
