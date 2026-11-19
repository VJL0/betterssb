"""Seats a student can actually register for."""

from __future__ import annotations


def seats_left(seats_available: int, cross_list_available: int | None) -> int:
    """A cross-listed section also needs room in its group, which can fill first.

    Banner's own `seatsAvailable` ignores the group: in Spring 2027, 69
    sections showed open seats while their cross-list group was full.
    """
    if cross_list_available is None:
        return seats_available
    return min(seats_available, cross_list_available)
