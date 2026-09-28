import pytest
from pydantic import ValidationError

from mytasks_api.schemas.task import TaskUpdate

pytestmark = pytest.mark.unit


def test_task_update_accepts_a_single_field() -> None:
    update = TaskUpdate.model_validate({"pinned": True})

    assert update.updated_fields() == {"pinned": True}


def test_task_update_rejects_empty_body() -> None:
    with pytest.raises(ValidationError):
        TaskUpdate.model_validate({})


def test_task_update_only_includes_explicitly_set_fields() -> None:
    update = TaskUpdate.model_validate({"title": "Nuevo título"})

    assert update.updated_fields() == {"title": "Nuevo título"}


def test_task_update_strips_whitespace_from_title() -> None:
    update = TaskUpdate.model_validate({"title": "  Nuevo título  "})

    assert update.title == "Nuevo título"


def test_task_update_rejects_title_blank_after_stripping() -> None:
    with pytest.raises(ValidationError):
        TaskUpdate.model_validate({"title": "   "})


def test_task_update_rejects_title_over_200_chars() -> None:
    with pytest.raises(ValidationError):
        TaskUpdate.model_validate({"title": "a" * 201})


def test_task_update_rejects_description_over_2000_chars() -> None:
    with pytest.raises(ValidationError):
        TaskUpdate.model_validate({"description": "a" * 2001})


def test_task_update_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        TaskUpdate.model_validate({"pinned": True, "unexpected": "value"})
