from __future__ import annotations

import httpx2
import pytest

from app.core.errors import upstream_failure_status

REQUEST = httpx2.Request("GET", "https://banner.example.edu/")


class UpstreamDown(Exception):
    pass


def chained(cause: BaseException) -> UpstreamDown:
    try:
        raise UpstreamDown from cause
    except UpstreamDown as exc:
        return exc


@pytest.mark.parametrize(
    ("cause", "status"),
    [
        (httpx2.ReadTimeout("slow", request=REQUEST), 504),
        (httpx2.ConnectTimeout("slow", request=REQUEST), 504),
        (httpx2.ConnectError("refused", request=REQUEST), 502),
        (ValueError("not JSON"), 502),
    ],
)
def test_timeouts_are_gateway_timeouts(cause: BaseException, status: int) -> None:
    assert upstream_failure_status(chained(cause)) == status


def test_no_cause_is_a_bad_gateway() -> None:
    assert upstream_failure_status(UpstreamDown()) == 502
