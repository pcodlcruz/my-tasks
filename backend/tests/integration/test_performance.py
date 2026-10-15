from __future__ import annotations

import math
import time
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedManyFactory

pytestmark = [pytest.mark.integration, pytest.mark.perf]

P95_LIMIT_MS = 300.0
SAMPLES = 20
# The cap is 500 active tasks and the test creates/reopens/restores up to 20 more
# (at no point are there more than ACTIVE_TASKS + SAMPLES active): 480 + 20 = 500.
ACTIVE_TASKS = 480
COMPLETED_TASKS = 120
TRASHED_TASKS = 60


def _p95(samples_ms: list[float]) -> float:
    ordered = sorted(samples_ms)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


async def _measure(
    name: str,
    calls: list[Callable[[], Awaitable[httpx.Response]]],
    expected_status: int,
    results: dict[str, float],
) -> None:
    samples_ms: list[float] = []
    for call in calls:
        started = time.perf_counter()
        response = await call()
        samples_ms.append((time.perf_counter() - started) * 1000)
        assert response.status_code == expected_status, (name, response.text)
    results[name] = _p95(samples_ms)


async def test_every_endpoint_meets_the_p95_latency_goal_with_500_active_tasks(
    client: httpx.AsyncClient,
    google_user: GoogleUserFactory,
    seed_many_tasks: SeedManyFactory,
) -> None:
    user = await google_user("perf@example.com")
    headers = {"Authorization": f"Bearer {user.id_token}"}
    active = await seed_many_tasks(user.uid, ACTIVE_TASKS)
    completed = await seed_many_tasks(user.uid, COMPLETED_TASKS, status="completed")
    trashed = await seed_many_tasks(user.uid, TRASHED_TASKS, in_trash=True)
    results: dict[str, float] = {}

    def get(path: str, **params: object) -> Callable[[], Awaitable[httpx.Response]]:
        return lambda: client.get(path, params=params, headers=headers)  # type: ignore[arg-type]

    def send(method: str, path: str, **kwargs: object) -> Callable[[], Awaitable[httpx.Response]]:
        return lambda: client.request(method, path, headers=headers, **kwargs)  # type: ignore[arg-type]

    # Warm-up: the first large read after the emulator starts is noticeably slower
    # (cold start) and does not represent steady state.
    await client.get("/api/v1/tasks", params={"view": "board"}, headers=headers)

    await _measure("GET /healthz", [send("GET", "/healthz")] * SAMPLES, 200, results)
    await _measure(
        "GET /tasks?view=board", [get("/api/v1/tasks", view="board")] * SAMPLES, 200, results
    )
    await _measure(
        "GET /tasks?view=board&scope=work",
        [get("/api/v1/tasks", view="board", scope="work")] * SAMPLES,
        200,
        results,
    )
    await _measure(
        "GET /tasks?view=history",
        [get("/api/v1/tasks", view="history", limit=50)] * SAMPLES,
        200,
        results,
    )
    await _measure(
        "GET /tasks?view=trash",
        [get("/api/v1/tasks", view="trash", limit=50)] * SAMPLES,
        200,
        results,
    )
    await _measure("GET /tasks/{id}", [get(f"/api/v1/tasks/{active[0]}")] * SAMPLES, 200, results)
    await _measure(
        "POST /tasks",
        [
            send(
                "POST",
                "/api/v1/tasks",
                json={
                    "title": f"Nueva {index}",
                    "description": "Detalle",
                    "urgent": True,
                    "important": False,
                    "scope": "work",
                },
            )
            for index in range(SAMPLES)
        ],
        201,
        results,
    )
    await _measure(
        "PATCH /tasks/{id}",
        [
            send("PATCH", f"/api/v1/tasks/{task_id}", json={"urgent": False})
            for task_id in active[:SAMPLES]
        ],
        200,
        results,
    )
    await _measure(
        "POST /tasks/{id}/complete",
        [
            send("POST", f"/api/v1/tasks/{task_id}/complete")
            for task_id in active[20 : 20 + SAMPLES]
        ],
        200,
        results,
    )
    await _measure(
        "POST /tasks/{id}/reopen",
        [send("POST", f"/api/v1/tasks/{task_id}/reopen") for task_id in completed[:SAMPLES]],
        200,
        results,
    )
    await _measure(
        "POST /tasks/{id}/trash",
        [send("POST", f"/api/v1/tasks/{task_id}/trash") for task_id in active[40 : 40 + SAMPLES]],
        200,
        results,
    )
    await _measure(
        "POST /tasks/{id}/restore",
        [send("POST", f"/api/v1/tasks/{task_id}/restore") for task_id in trashed[:SAMPLES]],
        200,
        results,
    )
    await _measure(
        "DELETE /tasks/{id}",
        [send("DELETE", f"/api/v1/tasks/{task_id}") for task_id in trashed[SAMPLES : SAMPLES * 2]],
        204,
        results,
    )

    report = "\n".join(f"{name:<36} p95 = {value:7.1f} ms" for name, value in results.items())
    print(f"\n{report}")
    too_slow = {name: value for name, value in results.items() if value >= P95_LIMIT_MS}
    assert not too_slow, f"Endpoints por encima de {P95_LIMIT_MS} ms (p95): {too_slow}"
