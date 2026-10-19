def test_t084_controlled_failure() -> None:
    # Deliberate failure to time the pipeline failure notification (T084). Never merge.
    assert False, "T084 controlled failure"
