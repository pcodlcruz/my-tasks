"""Tests of .github/scripts/cors-origins.sh (feature 005, contracts/pipeline-env.md section 1).

The script composes the CORS_ORIGINS list of the API for one environment:

1. the run.app URL of the web,
2. the Firebase Hosting address `<project>.web.app`,
3. the origins of the GitHub environment variable CUSTOM_WEB_ORIGINS (optional).

It must reject a malformed origin by naming it, and must keep one environment from inheriting the
domain of the other (staging only accepts `https://staging.` origins, production none).

Run from anywhere: python3 .github/scripts/tests/test_cors_origins.py
"""

import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "cors-origins.sh"

STAGING = {
    "ENVIRONMENT": "staging",
    "PROJECT_ID": "pdlco-mytasks-stg",
    "PROJECT_NUMBER": "838389521553",
    "REGION": "europe-southwest1",
}
PRODUCTION = {
    "ENVIRONMENT": "production",
    "PROJECT_ID": "pdlco-mytasks",
    "PROJECT_NUMBER": "2195266360",
    "REGION": "europe-southwest1",
}

STAGING_BASE = (
    "https://mytasks-web-838389521553.europe-southwest1.run.app,https://pdlco-mytasks-stg.web.app"
)
PRODUCTION_BASE = (
    "https://mytasks-web-2195266360.europe-southwest1.run.app,https://pdlco-mytasks.web.app"
)


def run(base, custom, label, expect_ok, expect_text="", expect_exact=None):
    env = {k: v for k, v in os.environ.items() if k != "CUSTOM_WEB_ORIGINS"}
    env.update(base)
    if custom is not None:
        env["CUSTOM_WEB_ORIGINS"] = custom
    if not SCRIPT.exists():
        print("FAIL", label, f"\n  {SCRIPT} does not exist")
        return False
    # cwd is a scratch directory with files, so an unquoted `*` would show up as file names.
    result = subprocess.run(
        ["bash", str(SCRIPT)], env=env, capture_output=True, text=True, cwd=SCRIPT.parent
    )
    out = result.stdout + result.stderr
    ok = (result.returncode == 0) == expect_ok and expect_text in out
    if expect_exact is not None:
        ok = ok and result.stdout.strip() == expect_exact
    print(("pass" if ok else "FAIL"), label, "" if ok else f"\n  exit={result.returncode}\n  {out}")
    return ok


BAD = [
    ("http://inserttask.com", "plain http"),
    ("inserttask.com", "no scheme"),
    ("*", "a bare wildcard"),
    ("https://*.inserttask.com", "a wildcard host"),
    ("https://inserttask.com/", "a trailing slash"),
    ("https://inserttask.com/path", "a path"),
    ("https://inserttask.com:8443", "a port"),
    ("https://Inserttask.com", "upper case"),
    ("https://inserttask", "a host without a dot"),
    ("https://-bad.inserttask.com", "a label that starts with a dash"),
    ("https://127.0.0.1", "an IPv4 address"),
    ("https://10.0.0.1", "a private IPv4 address"),
    ("https://inserttask.123", "a numeric last label"),
    ("https://a.example.com,https://b.example.com", "a comma inside the value"),
    ("https://in serttask.com", "a space inside an origin"),
]

results = [
    run(STAGING, None, "staging without the variable", True, expect_exact=STAGING_BASE),
    run(PRODUCTION, None, "production without the variable", True, expect_exact=PRODUCTION_BASE),
    run(STAGING, "", "staging with an empty variable", True, expect_exact=STAGING_BASE),
    run(PRODUCTION, "  \n ", "production with a blank variable", True, expect_exact=PRODUCTION_BASE),
    run(
        STAGING,
        "https://staging.inserttask.com",
        "staging with its rehearsal domain",
        True,
        expect_exact=STAGING_BASE + ",https://staging.inserttask.com",
    ),
    run(
        PRODUCTION,
        "https://inserttask.com",
        "production with its domain",
        True,
        expect_exact=PRODUCTION_BASE + ",https://inserttask.com",
    ),
    run(
        PRODUCTION,
        "https://inserttask.com https://other.example.org",
        "several origins separated by a space",
        True,
        expect_exact=PRODUCTION_BASE + ",https://inserttask.com,https://other.example.org",
    ),
    run(
        PRODUCTION,
        "https://inserttask.com\nhttps://other.example.org",
        "several origins separated by a new line",
        True,
        expect_exact=PRODUCTION_BASE + ",https://inserttask.com,https://other.example.org",
    ),
    run(
        PRODUCTION,
        "https://inserttask.com https://inserttask.com",
        "a duplicated origin is kept once",
        True,
        expect_exact=PRODUCTION_BASE + ",https://inserttask.com",
    ),
    run(
        PRODUCTION,
        "https://pdlco-mytasks.web.app",
        "an origin that is already in the fixed ones is kept once",
        True,
        expect_exact=PRODUCTION_BASE,
    ),
    run(
        STAGING,
        "https://inserttask.com",
        "staging with the production domain",
        False,
        "https://inserttask.com",
    ),
    run(
        STAGING,
        "https://other.example.org",
        "staging with an origin that does not start with https://staging.",
        False,
        "https://other.example.org",
    ),
    run(
        PRODUCTION,
        "https://staging.inserttask.com",
        "production with the staging domain",
        False,
        "https://staging.inserttask.com",
    ),
    run({**STAGING, "ENVIRONMENT": "qa"}, None, "an unknown environment", False, "qa"),
]
for value, why in BAD:
    # Staging would also reject these for not starting with https://staging., so production is
    # the environment that proves the format check.
    results.append(run(PRODUCTION, value, f"production rejects {why}", False, value.split()[0]))

sys.exit(0 if all(results) else 1)
