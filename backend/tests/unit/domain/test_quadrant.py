import pytest

from mytasks_api.domain.task import Quadrant, quadrant_for

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("urgent", "important", "expected"),
    [
        (True, True, Quadrant.DO_NOW),
        (False, True, Quadrant.SCHEDULE),
        (True, False, Quadrant.DELEGATE),
        (False, False, Quadrant.ELIMINATE),
    ],
)
def test_quadrant_for_returns_expected_quadrant(
    urgent: bool, important: bool, expected: Quadrant
) -> None:
    assert quadrant_for(urgent=urgent, important=important) is expected
