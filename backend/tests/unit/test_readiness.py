import asyncio
import logging
from collections.abc import Callable
from typing import cast

import pytest
from google.cloud import firestore

from mytasks_api.readiness import READINESS_CACHE_SECONDS, ReadinessProbe

pytestmark = pytest.mark.unit


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class _Client:
    """Firestore client double that counts the minimal reads and can be made to fail."""

    def __init__(self, *, failing: bool = False, delay: float = 0.0) -> None:
        self.reads = 0
        self.failing = failing
        self.delay = delay

    def collection(self, _: str) -> "_Client":
        return self

    def document(self, _: str) -> "_Client":
        return self

    async def get(self) -> None:
        self.reads += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.failing:
            message = "firestore unreachable"
            raise ConnectionError(message)


def _factory(client: _Client) -> Callable[[], firestore.AsyncClient]:
    return lambda: cast("firestore.AsyncClient", client)


def _probe(clock: _Clock) -> ReadinessProbe:
    return ReadinessProbe(ttl_seconds=5.0, clock=clock)


def _failures(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.getMessage() == "readiness_failed"]


def test_cache_window_is_a_few_seconds() -> None:
    assert 5 <= READINESS_CACHE_SECONDS <= 10


async def test_probe_reuses_the_result_within_the_window() -> None:
    clock, client = _Clock(), _Client()
    probe = _probe(clock)

    first = await probe.is_ready(_factory(client))
    clock.now += 4.9
    second = await probe.is_ready(_factory(client))

    assert (first, second) == (True, True)
    assert client.reads == 1


async def test_probe_checks_again_once_the_window_has_passed() -> None:
    clock, client = _Clock(), _Client()
    probe = _probe(clock)

    await probe.is_ready(_factory(client))
    clock.now += 5.0
    await probe.is_ready(_factory(client))

    assert client.reads == 2


async def test_probe_caches_a_failure_and_logs_it_once_per_window(
    caplog: pytest.LogCaptureFixture,
) -> None:
    clock, client = _Clock(), _Client(failing=True)
    probe = _probe(clock)

    with caplog.at_level(logging.ERROR):
        results = [await probe.is_ready(_factory(client)) for _ in range(50)]

    assert results == [False] * 50
    assert client.reads == 1
    assert len(_failures(caplog)) == 1


async def test_probe_logs_again_in_the_next_window_while_it_keeps_failing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    clock, client = _Clock(), _Client(failing=True)
    probe = _probe(clock)

    with caplog.at_level(logging.ERROR):
        await probe.is_ready(_factory(client))
        clock.now += 5.0
        await probe.is_ready(_factory(client))

    assert len(_failures(caplog)) == 2


async def test_probe_recovers_in_the_window_after_the_service_comes_back() -> None:
    clock, client = _Clock(), _Client(failing=True)
    probe = _probe(clock)

    down = await probe.is_ready(_factory(client))
    client.failing = False
    still_cached = await probe.is_ready(_factory(client))
    clock.now += 5.0
    up = await probe.is_ready(_factory(client))

    assert (down, still_cached, up) == (False, False, True)


async def test_concurrent_requests_share_a_single_check() -> None:
    clock, client = _Clock(), _Client(delay=0.05)
    probe = _probe(clock)

    results = await asyncio.gather(*(probe.is_ready(_factory(client)) for _ in range(20)))

    assert results == [True] * 20
    assert client.reads == 1


async def test_reset_forgets_the_last_result() -> None:
    clock, client = _Clock(), _Client()
    probe = _probe(clock)
    await probe.is_ready(_factory(client))

    probe.reset()
    await probe.is_ready(_factory(client))

    assert client.reads == 2
