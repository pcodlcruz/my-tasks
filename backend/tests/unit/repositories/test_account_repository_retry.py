import pytest
from google.api_core import exceptions as google_exceptions

from mytasks_api.repositories import account_repository
from mytasks_api.repositories.account_repository import _retry_on_abort

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    async def instant(_: float) -> None:
        return None

    monkeypatch.setattr(account_repository.asyncio, "sleep", instant)


def _exhausted_attempts() -> ValueError:
    """What the Firestore client raises when its own commit attempts all lost the lock race."""
    error = ValueError("Failed to commit transaction in 5 attempts.")
    error.__cause__ = google_exceptions.Aborted("Transaction lock timeout.")
    return error


class Flaky:
    def __init__(self, failures: list[Exception]) -> None:
        self.failures = failures
        self.calls = 0

    async def __call__(self) -> str:
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return "done"


async def test_retry_on_abort_returns_the_result_after_an_aborted_transaction() -> None:
    operation = Flaky([google_exceptions.Aborted("lock timeout")])

    assert await _retry_on_abort(operation) == "done"
    assert operation.calls == 2


async def test_retry_on_abort_also_retries_when_the_client_ran_out_of_commit_attempts() -> None:
    operation = Flaky([_exhausted_attempts(), _exhausted_attempts()])

    assert await _retry_on_abort(operation) == "done"
    assert operation.calls == 3


async def test_retry_on_abort_gives_up_after_four_attempts() -> None:
    operation = Flaky([google_exceptions.Aborted("lock timeout")] * 10)

    with pytest.raises(google_exceptions.Aborted):
        await _retry_on_abort(operation)

    assert operation.calls == 4


async def test_retry_on_abort_does_not_retry_an_unrelated_error() -> None:
    operation = Flaky([ValueError("not a contention problem")])

    with pytest.raises(ValueError, match="not a contention problem"):
        await _retry_on_abort(operation)

    assert operation.calls == 1


async def test_retry_on_abort_does_not_retry_a_value_error_caused_by_something_else() -> None:
    error = ValueError("bad data")
    error.__cause__ = KeyError("status")
    operation = Flaky([error])

    with pytest.raises(ValueError, match="bad data"):
        await _retry_on_abort(operation)

    assert operation.calls == 1


async def test_every_transactional_call_gets_its_own_wrapper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The Firestore wrapper keeps the transaction ids on itself. One shared by concurrent
    # requests would hand a retry the id of another request's transaction, which then waits
    # on that one's locks until they time out.
    created: list[object] = []
    real = account_repository.firestore.async_transactional

    def counting(function):  # type: ignore[no-untyped-def]
        wrapper = real(function)
        created.append(wrapper)
        return wrapper

    monkeypatch.setattr(account_repository.firestore, "async_transactional", counting)

    class FakeTransaction:
        _read_only = False
        _max_attempts = 1

        def _clean_up(self) -> None: ...

        async def _begin(self, retry_id: object = None) -> None:
            self._id = b"id"

        async def _commit(self) -> None: ...

    @account_repository._transactional
    async def operation(transaction: object, value: str) -> str:
        return value

    await operation(FakeTransaction(), "a")  # type: ignore[arg-type]
    await operation(FakeTransaction(), "b")  # type: ignore[arg-type]

    assert len(created) == 2
    assert created[0] is not created[1]
