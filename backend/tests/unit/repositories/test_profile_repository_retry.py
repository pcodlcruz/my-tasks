import asyncio
from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest
from google.api_core import exceptions as google_exceptions

from mytasks_api.domain.profile import (
    AvatarChoice,
    AvatarKind,
    AvatarRateLimitedError,
    default_profile,
)
from mytasks_api.repositories import account_repository, profile_repository
from mytasks_api.repositories.profile_repository import ProfileRepository

pytestmark = pytest.mark.unit

NOW = datetime(2026, 10, 24, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    async def instant(_: float) -> None:
        return None

    monkeypatch.setattr(account_repository.asyncio, "sleep", instant)


def _exhausted_attempts() -> ValueError:
    error = ValueError("Failed to commit transaction in 5 attempts.")
    error.__cause__ = google_exceptions.Aborted("Transaction lock timeout.")
    return error


class Flaky:
    """Stands in for a transactional function: fails with the given errors, then succeeds."""

    def __init__(self, failures: list[Exception]) -> None:
        self.failures = failures
        self.calls = 0

    async def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return default_profile()


def _repository() -> ProfileRepository:
    return ProfileRepository(MagicMock())


async def test_an_upload_that_loses_a_lock_race_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([google_exceptions.Aborted("lock race")])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)

    profile = await _repository().upload_avatar("uid-1", b"webp", NOW)

    assert profile == default_profile()
    assert flaky.calls == 2


async def test_an_upload_is_also_retried_when_the_client_ran_out_of_commit_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    flaky = Flaky([_exhausted_attempts()])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)

    await _repository().upload_avatar("uid-1", b"webp", NOW)

    assert flaky.calls == 2


async def test_an_upload_gives_up_after_four_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([google_exceptions.Aborted("lock race") for _ in range(10)])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)

    with pytest.raises(google_exceptions.Aborted):
        await _repository().upload_avatar("uid-1", b"webp", NOW)

    assert flaky.calls == 4


async def test_a_rate_limited_upload_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([AvatarRateLimitedError(120)])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)

    with pytest.raises(AvatarRateLimitedError) as rejected:
        await _repository().upload_avatar("uid-1", b"webp", NOW)

    assert rejected.value.retry_after_seconds == 120
    assert flaky.calls == 1


async def test_a_removal_that_loses_a_lock_race_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([google_exceptions.Aborted("lock race")])
    monkeypatch.setattr(profile_repository, "_apply_avatar_removal", flaky)

    profile = await _repository().remove_avatar("uid-1")

    assert profile == default_profile()
    assert flaky.calls == 2


async def test_an_unrelated_error_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([RuntimeError("firestore unavailable")])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)

    with pytest.raises(RuntimeError):
        await _repository().upload_avatar("uid-1", b"webp", NOW)

    assert flaky.calls == 1


@pytest.mark.parametrize(
    "name", ["_apply_avatar_choice", "_apply_avatar_upload", "_apply_avatar_removal"]
)
def test_the_transactions_are_not_the_wrapper_the_library_shares_between_requests(
    name: str,
) -> None:
    # `firestore.async_transactional` at module level keeps the transaction ids on one object
    # that every concurrent request would share: a retry would get another request's id and
    # wait on its locks until they time out. `_transactional` builds a new wrapper per call.
    assert type(getattr(profile_repository, name)).__name__ != "_AsyncTransactional"


class Tracker:
    """Records how many calls run at once, so a test can see whether they were serialized."""

    def __init__(self) -> None:
        self.running = 0
        self.max_running = 0
        self.order: list[str] = []

    async def __call__(
        self, transaction: Any, profile_ref: Any, avatar_ref: Any, *rest: Any
    ) -> Any:
        self.running += 1
        self.max_running = max(self.max_running, self.running)
        # A real wait: the autouse fixture above makes `asyncio.sleep` instant, which would
        # never hand control to another task and so could not show any overlap.
        loop = asyncio.get_running_loop()
        done = loop.create_future()
        loop.call_later(0.01, done.set_result, None)
        await done
        self.running -= 1
        return default_profile()


async def test_avatar_changes_of_the_same_person_run_one_at_a_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Two tabs of one person on one instance would otherwise race for the same document and
    # lose a lock race that Firestore only settles after a timeout.
    tracker = Tracker()
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", tracker)
    monkeypatch.setattr(profile_repository, "_apply_avatar_removal", tracker)
    repository = _repository()

    await asyncio.gather(
        repository.upload_avatar("uid-1", b"a", NOW),
        repository.upload_avatar("uid-1", b"b", NOW),
        repository.remove_avatar("uid-1"),
    )

    assert tracker.max_running == 1


async def test_avatar_changes_of_different_people_do_not_wait_for_each_other(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracker = Tracker()
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", tracker)
    repository = _repository()

    await asyncio.gather(
        repository.upload_avatar("uid-1", b"a", NOW),
        repository.upload_avatar("uid-2", b"b", NOW),
    )

    assert tracker.max_running == 2


async def test_a_catalog_choice_is_serialized_with_the_uploads_of_the_same_person(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracker = Tracker()
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", tracker)
    monkeypatch.setattr(profile_repository, "_apply_avatar_choice", tracker)
    repository = _repository()

    await asyncio.gather(
        repository.upload_avatar("uid-1", b"a", NOW),
        repository.update("uid-1", {}, AvatarChoice(kind=AvatarKind.PRESET, preset="avatar-03")),
    )

    assert tracker.max_running == 1


async def test_the_lock_is_released_when_a_change_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    flaky = Flaky([RuntimeError("firestore unavailable")])
    monkeypatch.setattr(profile_repository, "_apply_avatar_upload", flaky)
    repository = _repository()

    with pytest.raises(RuntimeError):
        await repository.upload_avatar("uid-1", b"a", NOW)
    profile = await asyncio.wait_for(repository.upload_avatar("uid-1", b"b", NOW), timeout=1)

    assert profile == default_profile()


def test_the_per_person_locks_do_not_pile_up() -> None:
    import gc

    for index in range(50):
        lock = profile_repository._person_lock(f"uid-{index}")
        assert lock is profile_repository._person_lock(f"uid-{index}")
    del lock  # the loop variable would keep the last one alive
    gc.collect()

    assert len(profile_repository._PERSON_LOCKS) == 0
