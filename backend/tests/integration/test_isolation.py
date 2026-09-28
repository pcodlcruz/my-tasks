from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from tests.conftest import GoogleUserFactory, SeedTaskFactory

pytestmark = pytest.mark.integration


async def test_get_task_of_another_user_returns_404(
    client: httpx.AsyncClient, google_user: GoogleUserFactory, seed_task: SeedTaskFactory
) -> None:
    owner = await google_user("owner@example.com")
    intruder = await google_user("intruder@example.com")
    task_id = await seed_task(owner.uid)

    response = await client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {intruder.id_token}"},
    )

    assert response.status_code == 404


async def test_signing_in_again_with_same_google_account_returns_same_uid(
    google_user: GoogleUserFactory,
) -> None:
    first = await google_user("owner@example.com")
    second = await google_user("owner@example.com")

    assert first.uid == second.uid
