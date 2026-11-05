#!/usr/bin/env python3
"""Export the Stitch screens of feature 008 (S3 v4) to docs/design/screens/<dir>/.

Run it yourself with your own OAuth access token (the agent never sees it); the Stitch
API rejects API keys:

    STITCH_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
    STITCH_QUOTA_PROJECT=<project-id> python3 docs/design/export-stitch.py

STITCH_QUOTA_PROJECT is the project billed for the calls; it must have the Stitch API
enabled and you need serviceusage.services.use on it.

The download endpoint may answer with the raw file or with a JSON wrapper; both are
handled. Each file is validated (PNG signature, HTML markup) before it is written.
"""

import base64
import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT = "projects/13869439670490335529"
BASE_URL = "https://stitch.googleapis.com/v1"
SCREENS_DIR = Path(__file__).resolve().parent / "screens"

# (target dir, variant, html file id, screenshot file id)
EXPORTS = [
    ("s3-board-v4", "desktop", "8f10499883594e5fa5c94a95fb636139", "d9f407c18d1c43b6b739f2b9973c0499"),
    ("s3-board-v4", "mobile", "d569c935cf254661a3b446ae8eb77115", "1e252fb63f774f598ddbdf37b1c541ae"),
    ("s3-board-v4-v2", "desktop", "1a13a3010da6469e9e63c1b095cf4d6b", "fbe1a35aee4e4816812a3ffe281e2d82"),
    ("s3-board-v4-dark", "desktop", "6f811e6ae58943cda971f8cfe7f44e2c", "b4877ca87695412991d175e71a714a4b"),
    ("s3-board-v4-compact", "desktop", "6f63bdb429174e24a587b1dcada6e065", "602b5f87d89e41f18263ba9c6f7ab2d5"),
    ("s3-board-v4-compact-dark", "desktop", "4a92a899733b467bb73c8f00d69540c6", "9074f961f7334f45a96d7e0dcddde238"),
]

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Keys under which a JSON wrapper may carry the file content or a follow-up URL.
CONTENT_KEYS = ("dataString", "html", "image", "content", "data", "bytes", "body")
URL_KEYS = ("downloadUri", "downloadUrl", "mediaLink", "url", "uri")


def auth_headers() -> dict[str, str]:
    token = os.environ.get("STITCH_ACCESS_TOKEN")
    if not token:
        sys.exit("Set STITCH_ACCESS_TOKEN (an OAuth access token) before running this script.")
    headers = {"Authorization": f"Bearer {token}"}
    quota_project = os.environ.get("STITCH_QUOTA_PROJECT")
    if quota_project:
        headers["X-Goog-User-Project"] = quota_project
    return headers


class HttpError(Exception):
    def __init__(self, status: int, body: bytes) -> None:
        super().__init__(f"HTTP {status}: {body[:200]!r}")
        self.status = status


def fetch(url: str, headers: dict[str, str]) -> bytes:
    # curl uses the system trust store; urllib may not find root certificates on macOS.
    # Headers go through stdin so the credential never appears in the process list.
    config = "".join(f'header = "{name}: {value}"\n' for name, value in headers.items())
    result = subprocess.run(
        ["curl", "-sS", "--max-time", "60", "-K", "-", "-w", "\n%{http_code}", url],
        input=config.encode(),
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise HttpError(0, result.stderr)
    body, _, status = result.stdout.rpartition(b"\n")
    if not status.isdigit() or int(status) >= 400:
        raise HttpError(int(status) if status.isdigit() else 0, body)
    return body


def find_value(node: object, keys: tuple[str, ...]) -> str | None:
    """Depth-first search for the first string value under any of the given keys."""
    if isinstance(node, dict):
        for key in keys:
            value = node.get(key)
            if isinstance(value, str) and value:
                return value
        children = node.values()
    elif isinstance(node, list):
        children = node
    else:
        return None
    for child in children:
        found = find_value(child, keys)
        if found:
            return found
    return None


def unwrap(raw: bytes, kind: str, headers: dict[str, str]) -> bytes:
    """Return the file bytes, decoding a JSON wrapper when the endpoint sends one."""
    if raw.startswith(PNG_SIGNATURE) or not raw.lstrip().startswith(b"{"):
        return raw
    wrapper = json.loads(raw)
    content = find_value(wrapper, CONTENT_KEYS)
    if content is not None:
        if kind == "html" and "<" in content:
            return content.encode("utf-8")
        return base64.b64decode(content + "=" * (-len(content) % 4), altchars=b"-_")
    url = find_value(wrapper, URL_KEYS)
    if url is not None:
        return fetch(url, headers)
    keys = list(wrapper) if isinstance(wrapper, dict) else type(wrapper).__name__
    raise ValueError(f"unknown JSON wrapper (top-level keys: {keys})")


def is_valid(data: bytes, kind: str) -> bool:
    if kind == "png":
        return data.startswith(PNG_SIGNATURE)
    head = data[:2048].lower()
    return b"<html" in head or b"<!doctype" in head


def download(file_id: str, kind: str, headers: dict[str, str]) -> bytes:
    url = f"{BASE_URL}/{PROJECT}/files/{file_id}:download"
    try:
        raw = fetch(f"{url}?alt=media", headers)
    except HttpError as error:
        if error.status != 400:
            raise
        raw = fetch(url, headers)
    return unwrap(raw, kind, headers)


def main() -> int:
    headers = auth_headers()
    failures = 0
    for target, variant, html_id, png_id in EXPORTS:
        out_dir = SCREENS_DIR / target
        for kind, file_id in (("html", html_id), ("png", png_id)):
            path = out_dir / f"{variant}.{kind}"
            try:
                data = download(file_id, kind, headers)
            except HttpError as error:
                print(f"FAIL {path.relative_to(SCREENS_DIR)}: {error}")
                if error.status in (401, 403):
                    print("Credential rejected; stopping.")
                    return 1
                failures += 1
                continue
            except (ValueError, json.JSONDecodeError) as error:
                print(f"FAIL {path.relative_to(SCREENS_DIR)}: {error}")
                failures += 1
                continue
            if not is_valid(data, kind):
                print(f"FAIL {path.relative_to(SCREENS_DIR)}: content is not {kind} ({data[:80]!r})")
                failures += 1
                continue
            out_dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            print(f"ok   {path.relative_to(SCREENS_DIR)} ({len(data)} bytes)")
    print(f"\n{len(EXPORTS) * 2 - failures} written, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
