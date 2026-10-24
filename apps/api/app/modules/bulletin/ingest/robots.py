"""robots.txt, read once per host before any other request to it.

If a host's robots.txt can't be read (a network error or a 5xx), nothing on
that host is fetched: no answer is not permission. A 404 means the host
publishes no rules, which RFC 9309 treats as allowing everything.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.robotparser import RobotFileParser

ROBOTS_PATH = "/robots.txt"
HTTP_NOT_FOUND = 404
HTTP_OK = 200


@dataclass(slots=True)
class HostRules:
    host: str
    status: int | None
    body: str
    parser: RobotFileParser | None

    @property
    def readable(self) -> bool:
        return self.status in {HTTP_OK, HTTP_NOT_FOUND}

    def allows(self, user_agent: str, url: str) -> bool:
        if not self.readable:
            return False
        if self.parser is None:
            return True
        return self.parser.can_fetch(user_agent, url)


def parse_rules(host: str, status: int | None, body: str) -> HostRules:
    if status != HTTP_OK:
        return HostRules(host, status, body, None)
    parser = RobotFileParser(f"https://{host}{ROBOTS_PATH}")
    parser.parse(body.splitlines())
    return HostRules(host, status, body, parser)
