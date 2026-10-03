from __future__ import annotations

import asyncio
import logging
import re
import time
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://prd-dars.temple.edu"

_CREATE_PATH = "/selfservice/audit/create.html"
_INIT_PATH = "/selfservice/audit/initializeWhatIfAudit.html"
_LIST_PATH = "/selfservice/audit/list.html"
_READ_PATH = "/selfservice/audit/read.html"

_RUN_ID_RE = re.compile(r'name="delete_id"\s+value="(JobQueueRun!!!![^"]+)"')
_STILL_RUNNING = 'title="Still running"'

_DEFAULT_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


class DarsError(Exception):
    """DARS returned something we could not handle."""


class DarsSessionError(DarsError):
    """The student's DARS session is missing or expired (DARS redirected to SSO login)."""


class DarsTimeoutError(DarsError):
    """The audit job did not finish within the polling window."""


class DarsClient:
    """Low-level HTTP adapter for u.achieve self-service (DARS), driven by a student's JSESSIONID.

    The session id is a live credential: it is only ever placed in the cookie jar and is
    never logged or included in error messages.
    """

    def __init__(
        self,
        session_id: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        poll_interval: float = 1.5,
        poll_timeout: float = 90.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._session_id = session_id
        self._base_url = base_url.rstrip("/")
        self._host = urlparse(self._base_url).hostname or ""
        self._poll_interval = poll_interval
        self._poll_timeout = poll_timeout
        self._transport = transport

    async def run_audit(self) -> str:
        """Request a declared-program audit, wait for it to finish, and return its report HTML."""
        async with self._client() as client:
            existing = _run_ids((await self._get(client, _LIST_PATH)).text)

            await self._get(client, _CREATE_PATH)
            init = (await self._get(client, _INIT_PATH, headers={"X-Requested-With": "XMLHttpRequest"})).json()
            try:
                form = {
                    "instcd": init["institutionsData"]["instcd"],
                    "previousDegreeProgramCollege": "null",
                    "previousDegreeProgramMajor": "null",
                    "previousDegreeProgramDegree": "null",
                    "catalogYearTerm": init["catalogYearTermValues"]["catalogYearTerm"],
                    "includeInProgressCourses": "true",
                    "includePlannedCourses": " ",
                    "sysIn.evalsw": "S",
                    "auditTemplate": "htm!!!!htm",
                    "useDefaultDegreePrograms": "true",
                    "pageRefresh": "false",
                }
            except (KeyError, TypeError) as exc:
                raise DarsError("Unexpected audit form data from DARS") from exc

            resp = await client.post(_CREATE_PATH, data=form)
            self._check(resp)
            if not resp.is_redirect or _LIST_PATH not in resp.headers.get("location", ""):
                raise DarsError(f"DARS did not accept the audit request (HTTP {resp.status_code})")

            run_id = await self._wait_for_run(client, existing)
            logger.info("DARS audit finished")
            return (await self._get(client, _READ_PATH, params={"printerFriendly": "true", "id": run_id})).text

    def _client(self) -> httpx.AsyncClient:
        client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=_DEFAULT_HEADERS,
            timeout=30,
            follow_redirects=False,
            transport=self._transport,
        )
        client.cookies.set("JSESSIONID", self._session_id, domain=self._host, path="/selfservice")
        return client

    async def _get(self, client: httpx.AsyncClient, path: str, **kwargs) -> httpx.Response:
        resp = await client.get(path, **kwargs)
        self._check(resp)
        if resp.is_redirect:
            raise DarsError(f"Unexpected redirect from DARS on {path}")
        return resp

    def _check(self, resp: httpx.Response) -> None:
        if resp.is_redirect:
            target = urlparse(urljoin(str(resp.url), resp.headers.get("location", "")))
            if target.hostname != self._host or "/loginroute" in target.path or "/saml/" in target.path:
                raise DarsSessionError("DARS session is missing or expired")
        elif resp.status_code >= 400:
            raise DarsError(f"DARS returned HTTP {resp.status_code} for {resp.request.url.path}")

    async def _wait_for_run(self, client: httpx.AsyncClient, existing: list[str]) -> str:
        deadline = time.monotonic() + self._poll_timeout
        while True:
            page = (await self._get(client, _LIST_PATH, params={"autoPoll": "true"})).text
            if _STILL_RUNNING not in page:
                new_ids = [run_id for run_id in _run_ids(page) if run_id not in existing]
                if new_ids:
                    return new_ids[0]
            if time.monotonic() >= deadline:
                raise DarsTimeoutError("DARS audit did not finish in time")
            await asyncio.sleep(self._poll_interval)


def _run_ids(list_html: str) -> list[str]:
    """Audit run ids on the list page, newest first (DARS sorts by run date descending)."""
    return _RUN_ID_RE.findall(list_html)
