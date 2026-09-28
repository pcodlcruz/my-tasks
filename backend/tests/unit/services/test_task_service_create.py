import uuid
from datetime import UTC, datetime

import pytest

from mytasks_api.domain.task import Scope, Status, Task
from mytasks_api.schemas.task import TaskCreate
from mytasks_api.services.task_service import TaskService

pytestmark = pytest.mark.unit


class FakeTaskRepository:
    def __init__(self) -> None:
        self.tasks: dict[str, dict[str, Task]] = {}

    async def get(self, uid: str, task_id: str) -> Task | None:
        return self.tasks.get(uid, {}).get(task_id)

    async def create(self, uid: str, data: TaskCreate) -> Task:
        now = datetime.now(UTC)
        task = Task(
            id=str(uuid.uuid4()),
            title=data.title,
            description=data.description,
            urgent=data.urgent,
            important=data.important,
            scope=Scope(data.scope),
            pinned=False,
            status=Status.ACTIVE,
            in_trash=False,
            created_at=now,
            updated_at=now,
            completed_at=None,
            trashed_at=None,
            purge_at=None,
        )
        self.tasks.setdefault(uid, {})[task.id] = task
        return task

    async def list_board(self, uid: str, scope: Scope | None = None) -> list[Task]:
        tasks = [
            task
            for task in self.tasks.get(uid, {}).values()
            if task.status == Status.ACTIVE and not task.in_trash
        ]
        if scope is not None:
            tasks = [task for task in tasks if task.scope == scope]
        return tasks


def _create_data(**overrides: object) -> TaskCreate:
    payload: dict[str, object] = {
        "title": "Comprar leche",
        "description": "En el supermercado",
        "urgent": True,
        "important": True,
        "scope": "personal",
    }
    payload.update(overrides)
    return TaskCreate.model_validate(payload)


async def test_create_task_applies_server_defaults() -> None:
    service = TaskService(FakeTaskRepository())  # type: ignore[arg-type]

    task = await service.create_task("user-1", _create_data())

    assert task.pinned is False
    assert task.status == Status.ACTIVE
    assert task.in_trash is False
    assert task.created_at is not None


async def test_list_board_returns_only_active_tasks_out_of_trash() -> None:
    repository = FakeTaskRepository()
    service = TaskService(repository)  # type: ignore[arg-type]
    await service.create_task("user-1", _create_data(title="Activa"))
    trashed = await repository.create("user-1", _create_data(title="En papelera"))
    trashed.in_trash = True

    board = await service.list_board("user-1")

    assert [task.title for task in board] == ["Activa"]


async def test_list_board_filters_by_scope() -> None:
    service = TaskService(FakeTaskRepository())  # type: ignore[arg-type]
    await service.create_task("user-1", _create_data(title="Laboral", scope="work"))
    await service.create_task("user-1", _create_data(title="Personal", scope="personal"))

    board = await service.list_board("user-1", scope=Scope.WORK)

    assert [task.title for task in board] == ["Laboral"]
