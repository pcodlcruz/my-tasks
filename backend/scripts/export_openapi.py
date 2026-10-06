"""Dump the OpenAPI contract of the API to a deterministic JSON file.

Used by the `api-contract-compat` CI check, which compares the contract of a PR with the
one of its target branch. The app is built in local mode so the export needs no real
project, credentials or emulators.
"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path

from mytasks_api.config import Settings
from mytasks_api.factory import create_app

DEFAULT_OUTPUT = Path("openapi.json")


def export_openapi(target: Path) -> None:
    settings = Settings(_env_file=None, app_env="local")  # type: ignore[call-arg]
    contract = create_app(settings).openapi()
    target.write_text(
        json.dumps(contract, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) > 1:
        sys.stderr.write("Usage: export_openapi.py [output.json]\n")
        return 2
    export_openapi(Path(args[0]) if args else DEFAULT_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
