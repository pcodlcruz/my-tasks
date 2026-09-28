import pytest
from pydantic import ValidationError

from mytasks_api.schemas.task import TaskCreate

pytestmark = pytest.mark.unit


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "title": "Comprar leche",
        "description": "En el supermercado de la esquina",
        "urgent": True,
        "important": False,
        "scope": "personal",
    }
    base.update(overrides)
    return base


def test_task_create_strips_surrounding_whitespace_from_title_and_description() -> None:
    task = TaskCreate.model_validate(_payload(title="  Comprar leche  ", description="  Notas  "))

    assert task.title == "Comprar leche"
    assert task.description == "Notas"


def test_task_create_rejects_title_blank_after_stripping() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(_payload(title="   "))


def test_task_create_rejects_description_blank_after_stripping() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(_payload(description="   "))


def test_task_create_accepts_title_at_200_chars() -> None:
    task = TaskCreate.model_validate(_payload(title="a" * 200))

    assert len(task.title) == 200


def test_task_create_rejects_title_over_200_chars() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(_payload(title="a" * 201))


def test_task_create_accepts_description_at_2000_chars() -> None:
    task = TaskCreate.model_validate(_payload(description="a" * 2000))

    assert len(task.description) == 2000


def test_task_create_rejects_description_over_2000_chars() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(_payload(description="a" * 2001))


def test_task_create_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(_payload(pinned=True))


def test_task_create_requires_scope_with_no_default() -> None:
    payload = _payload()
    del payload["scope"]

    with pytest.raises(ValidationError):
        TaskCreate.model_validate(payload)
