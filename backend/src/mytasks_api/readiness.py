import asyncio
import logging
import time
from collections.abc import Callable

from google.cloud import firestore

from mytasks_api.logging_config import log_event

logger = logging.getLogger(__name__)

READINESS_COLLECTION = "_readyz"
READINESS_DOCUMENT = "probe"
READINESS_TIMEOUT_SECONDS = 3.0

# How long the last result is reused. /readyz is anonymous, so without this every request
# would cost a Firestore read; with it the work per instance is bounded by 1 / this value
# whatever the traffic. The max instances of the service are the second bound.
READINESS_CACHE_SECONDS = 5.0


class ReadinessProbe:
    """Checks that Firestore is reachable and remembers the answer for a few seconds.

    Failures are cached too, so a broken service logs one error per window instead of one per
    request, and concurrent requests share a single check instead of each making their own.
    """

    def __init__(
        self,
        ttl_seconds: float = READINESS_CACHE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self._lock = asyncio.Lock()
        self._ready = False
        self._valid_until = float("-inf")

    def reset(self) -> None:
        """Forget the last result (the test suite shares one app between tests)."""
        self._lock = asyncio.Lock()
        self._ready = False
        self._valid_until = float("-inf")

    def _is_fresh(self) -> bool:
        return self._clock() < self._valid_until

    async def is_ready(self, client_factory: Callable[[], firestore.AsyncClient]) -> bool:
        if self._is_fresh():
            return self._ready
        async with self._lock:
            # Another request may have refreshed the result while this one waited.
            if self._is_fresh():
                return self._ready
            self._ready = await self._check(client_factory)
            self._valid_until = self._clock() + self.ttl_seconds
            return self._ready

    async def _check(self, client_factory: Callable[[], firestore.AsyncClient]) -> bool:
        try:
            async with asyncio.timeout(READINESS_TIMEOUT_SECONDS):
                # Building the client discovers credentials, which can fail or block for
                # seconds when the runtime identity is broken: it belongs inside the
                # try and off the event loop, so a broken service answers 503, not 500.
                client = await asyncio.to_thread(client_factory)
                # Minimal read: it proves the runtime identity can reach Firestore
                # without touching user data (the document does not need to exist).
                await client.collection(READINESS_COLLECTION).document(READINESS_DOCUMENT).get()
        except Exception as exc:
            # The cause goes to the log, never to the anonymous response.
            log_event(logger, logging.ERROR, "readiness_failed", reason=type(exc).__name__)
            return False
        return True
