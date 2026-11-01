#!/usr/bin/env python3
"""Export the approved Stitch screens of feature 007 to docs/design/screens/<dir>/.

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
    ("s3-board-v3", "desktop", "53531984f5e64243982006a7170ba285", "bd36003aa0fc42289a758ec0015fbe64"),
    ("s3-board-v3", "mobile", "4d660b666b164878b2ee626faf9d2b9b", "7249e6d01eb84a55a332f0e3c3cc14b2"),
    ("s3-board-v3-dark", "desktop", "ae49736f3f4743a58703fff386d09d9f", "e59b91478dac472c938690a96ec3088d"),
    ("s3-board-v3-dark", "mobile", "a2eb02893b1e4f0b8011c9f96f4f999b", "1bdbf485aa5847e4b0a082575d90eb39"),
    ("s3-board-v3-no-arcade", "desktop", "8e5ee79a1e6c48b783d938ced2656228", "f49aa2c0b8e542449408e96773cd686d"),
    ("s3c-celebrations", "desktop", "cf6dacede74248d48adbd604adf63abe", "0a5d77a7ad814482937e5553d4366bf6"),
    ("s3c-celebrations-dark", "desktop", "f9a391790b284f8c9b03e7ff36dd38ef", "e2d3272bb51f4ec1a39c7420da3daa55"),
    ("s7-profile-v2", "desktop", "4bdf2a3afdcc4186a998930c4da19e2c", "bac9ef305b714625a031d9aaeea1aed8"),
    ("s7-profile-v2", "mobile", "b1e650245428424e98e3b270333c0353", "e00fc7e59224450c9262eed611b01137"),
    ("s7-profile-v2-dark", "desktop", "4c1756fb4e0e4b25a97348fcad9d5256", "2f40fb8dcc744877acd4d3ac1aa6fc8e"),
    ("s7-profile-v2-dark", "mobile", "b985eed9ce484048a345fb1d3c9d5751", "6c3944f81043468daead293cc9f1345f"),
    ("s8-day-start", "desktop", "f59b885d90b14d8b965b8cf69b060e41", "85478995a36a48a490319949a58c3628"),
    ("s8-day-start", "mobile", "4414adf9dd3b4f9a913e90fa11c767bc", "ed811eff05534dd89224b47f126be674"),
    ("s8-day-start-dark", "desktop", "c5b3c76b11624d01b9a614734ea07916", "a7679795ec4944baa6413f87f43f2a39"),
    ("s8-day-start-dark", "mobile", "e88247e018204bf9aee86f3da73234c8", "dd12c818e4344ae3830961df446200c5"),
    ("s9-progress", "desktop", "7d9128d184bc402cac8eac81619a5e6c", "3d23249f1b444df083dfea97d3258229"),
    ("s9-progress", "mobile", "261e733aca514bdcbf3d261ae803760d", "bfee094787d7437aab7e77458aba23fc"),
    ("s9-progress-dark", "desktop", "a06fc15ef4b74721818127f5b87e6448", "cc5626b66ce64820900d03cbb0d32fa5"),
    ("s10-schedules", "desktop", "f719fb836bb14e678a8d968889403f32", "ff0d210357994e4893e2a558cc8a4326"),
    ("s10-schedules", "mobile", "e11a92c3d2e6469da3595641e863ee75", "1f71bda6ea0a447e803101ab546a06b1"),
    ("s10-schedules-dark", "desktop", "de2407fb5e664b799c231f6f03576de4", "269d256d27714bc095d188968f219bc6"),
    ("s11-schedule-form", "desktop", "0bcd6821fc7747718f98304fe1e80b4f", "e7a03ad0d2894e80891b2f3372e4023c"),
    ("s11-schedule-form", "mobile", "37f9f61b469d4bbb962ebe542678e801", "4f065fb1e4a549b29a6ad6db9d80bc77"),
    ("s11-schedule-form-dark", "desktop", "44e34962d15a4d4bb1269b707548e9af", "cebd9ff6f30541969d54760cc6c64961"),
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
