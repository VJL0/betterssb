from __future__ import annotations

import json

import httpx
import pytest

from app.integrations.dars.client import DarsClient, DarsError, DarsSessionError, DarsTimeoutError

BASE = "https://dars.example.edu"
SESSION = "FAKESESSION0000000000000000000000"
OLD_RUN = "JobQueueRun!!!!ISEhIWludFNlcU5vPTE="
NEW_RUN = "JobQueueRun!!!!ISEhIWludFNlcU5vPTI="

INIT_JSON = {
    "institutionsData": {"instcd": "TUB"},
    "catalogYearTermValues": {"catalogYearTerm": "202636"},
}
RUNNING_PAGE = '<table><tr><td><i class="fas fa-spinner fa-spin" title="Still running"></i></td></tr></table>'


def _list_page(*run_ids: str) -> str:
    rows = "".join(f'<tr><td><input type="checkbox" name="delete_id" value="{r}" /></td></tr>' for r in run_ids)
    return f"<table>{rows}</table>"


class FakeDars:
    """Minimal stand-in for u.achieve self-service: one audit that is 'running' for `polls_until_done` polls."""

    def __init__(self, polls_until_done: int = 1, session_valid: bool = True) -> None:
        self.polls_until_done = polls_until_done
        self.session_valid = session_valid
        self.submitted = False
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.session_valid or f"JSESSIONID={SESSION}" not in request.headers.get("cookie", ""):
            return httpx.Response(302, headers={"location": "https://sso.example.edu/idp/SSO"})

        path = request.url.path
        if path == "/selfservice/audit/create.html" and request.method == "GET":
            return httpx.Response(200, text="<form id='auditRequest'></form>")
        if path == "/selfservice/audit/initializeWhatIfAudit.html":
            return httpx.Response(200, text=json.dumps(INIT_JSON))
        if path == "/selfservice/audit/create.html" and request.method == "POST":
            self.submitted = True
            return httpx.Response(302, headers={"location": "/selfservice/audit/list.html?autoPoll=true"})
        if path == "/selfservice/audit/list.html":
            if not self.submitted:
                return httpx.Response(200, text=_list_page(OLD_RUN))
            if self.polls_until_done > 0:
                self.polls_until_done -= 1
                return httpx.Response(200, text=RUNNING_PAGE)
            return httpx.Response(200, text=_list_page(NEW_RUN, OLD_RUN))
        if path == "/selfservice/audit/read.html":
            return httpx.Response(200, text=f"<html>audit {request.url.params['id']}</html>")
        return httpx.Response(404)


def _client(fake: FakeDars, **kwargs) -> DarsClient:
    return DarsClient(SESSION, base_url=BASE, poll_interval=0, transport=httpx.MockTransport(fake), **kwargs)


class TestRunAudit:
    async def test_runs_waits_and_reads_new_audit(self):
        fake = FakeDars(polls_until_done=2)
        html = await _client(fake).run_audit()
        assert html == f"<html>audit {NEW_RUN}</html>"

        read = fake.requests[-1]
        assert read.url.params["printerFriendly"] == "true"
        assert read.url.params["id"] == NEW_RUN

    async def test_posts_declared_program_form(self):
        fake = FakeDars()
        await _client(fake).run_audit()
        post = next(r for r in fake.requests if r.method == "POST")
        form = dict(httpx.QueryParams(post.content.decode()))
        assert form["instcd"] == "TUB"
        assert form["catalogYearTerm"] == "202636"
        assert form["useDefaultDegreePrograms"] == "true"
        assert form["includeInProgressCourses"] == "true"
        assert form["auditTemplate"] == "htm!!!!htm"

    async def test_expired_session_raises_session_error(self):
        fake = FakeDars(session_valid=False)
        with pytest.raises(DarsSessionError):
            await _client(fake).run_audit()
        assert not fake.submitted

    async def test_session_error_does_not_leak_session_id(self):
        with pytest.raises(DarsSessionError) as exc_info:
            await _client(FakeDars(session_valid=False)).run_audit()
        assert SESSION not in str(exc_info.value)

    async def test_times_out_when_audit_never_finishes(self):
        fake = FakeDars(polls_until_done=10_000)
        with pytest.raises(DarsTimeoutError):
            await _client(fake, poll_timeout=0).run_audit()

    async def test_server_error_raises_dars_error(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(500)

        client = DarsClient(SESSION, base_url=BASE, transport=httpx.MockTransport(handler))
        with pytest.raises(DarsError):
            await client.run_audit()
