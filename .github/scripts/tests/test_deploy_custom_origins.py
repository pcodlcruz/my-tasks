"""Tests of the CORS origins in deploy.yml (feature 005, contracts/pipeline-env.md section 1).

Checked on the real workflow:

* the job reads the GitHub environment variable CUSTOM_WEB_ORIGINS, and the step "Check the custom
  web origins" composes the list with cors-origins.sh before anything is built or deployed, and
  stops the deployment when an origin is malformed;
* only the API revision receives CORS_ORIGINS, written with an alternative gcloud delimiter
  because the list contains commas;
* before any traffic moves, a step compares CORS_ORIGINS of the new API revision with the list
  that was composed, and stops the deployment on any difference.

Run from anywhere: python3 .github/scripts/tests/test_deploy_custom_origins.py
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"
workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
job = workflow["jobs"]["deploy"]
steps = job["steps"]
names = [s.get("name") for s in steps]

ORIGINS_STEP = "Check the custom web origins"
POST_CHECK_STEP = "Check the CORS origins of the new API revision"
DEPLOY_STEP = "Deploy the revisions without traffic"

ENV = {
    "ENVIRONMENT": "production",
    "PROJECT_ID": "pdlco-mytasks",
    "PROJECT_NUMBER": "2195266360",
    "REGION": "europe-southwest1",
}
BASE = "https://mytasks-web-2195266360.europe-southwest1.run.app,https://pdlco-mytasks.web.app"


def step(name):
    return next((s for s in steps if s.get("name") == name), None)


def index(name):
    return names.index(name) if name in names else -1


def report(ok, label, detail=""):
    print(("pass" if ok else "FAIL"), label, "" if ok else f"\n  {detail}")
    return ok


def run_origins_step(custom, label, expect_ok, expect_text=""):
    found = step(ORIGINS_STEP)
    if found is None:
        return report(False, label, f"the step '{ORIGINS_STEP}' does not exist")
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "github_output"
        output.write_text("", encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if k != "CUSTOM_WEB_ORIGINS"}
        env.update(ENV)
        env["GITHUB_OUTPUT"] = str(output)
        if custom is not None:
            env["CUSTOM_WEB_ORIGINS"] = custom
        result = subprocess.run(
            ["bash", "-c", found["run"]], env=env, capture_output=True, text=True, cwd=ROOT
        )
        written = output.read_text(encoding="utf-8")
    out = result.stdout + result.stderr
    ok = (result.returncode == 0) == expect_ok and expect_text in out + written
    if expect_ok and ok:
        ok = any(line.startswith("cors_origins=") for line in written.splitlines())
    if not expect_ok and ok:
        # A rejected list must not leave a half-written output behind.
        ok = "cors_origins=" not in written
    return report(ok, label, f"exit={result.returncode}\n  {out}\n  output={written!r}")


def revision(env):
    return json.dumps({"spec": {"containers": [{"env": [{"name": k, "value": v} for k, v in env.items()]}]}})


def run_post_check(actual, expected, label, expect_ok, expect_text=""):
    found = step(POST_CHECK_STEP)
    if found is None:
        return report(False, label, f"the step '{POST_CHECK_STEP}' does not exist")
    fake = f"gcloud() {{\n  echo '{revision(actual)}'\n}}\n"
    env = {
        **os.environ,
        **ENV,
        "API_REVISION": "mytasks-api-00042-abc",
        "EXPECTED_CORS_ORIGINS": expected,
    }
    result = subprocess.run(["bash", "-c", fake + found["run"]], env=env, capture_output=True, text=True)
    out = result.stdout + result.stderr
    ok = (result.returncode == 0) == expect_ok and expect_text in out
    return report(ok, label, f"exit={result.returncode}\n  {out}")


def check_wiring():
    results = []

    wired = job["env"].get("CUSTOM_WEB_ORIGINS") == "${{ vars.CUSTOM_WEB_ORIGINS }}"
    results.append(report(wired, "job env reads vars.CUSTOM_WEB_ORIGINS"))

    found = step(ORIGINS_STEP)
    exists = found is not None and found.get("id") == "origins"
    results.append(report(exists, "the origins step exists and has the id 'origins'"))
    if exists:
        results.append(
            report(".github/scripts/cors-origins.sh" in found["run"], "the origins step runs cors-origins.sh")
        )

    checkout = next((i for i, s in enumerate(steps) if str(s.get("uses", "")).startswith("actions/checkout")), -1)
    before = (
        exists
        and 0 <= checkout < index(ORIGINS_STEP)
        and index(ORIGINS_STEP) < index("Build and publish the API image")
        and index(ORIGINS_STEP) < index(DEPLOY_STEP)
    )
    results.append(report(before, "the origins step runs after the checkout and before any build or revision"))

    deploy = step(DEPLOY_STEP)
    deploy_env = deploy.get("env", {}) if deploy else {}
    results.append(
        report(
            deploy_env.get("CORS_ORIGINS") == "${{ steps.origins.outputs.cors_origins }}",
            "the deployment step receives the composed list through env, not by interpolation",
        )
    )
    script = deploy["run"] if deploy else ""
    guard = script.find('if [ "$component" = api ]')
    assignment = script.find("CORS_ORIGINS=$CORS_ORIGINS")
    only_api = (
        0 <= guard < assignment
        and "fi" not in script[guard:assignment].split("then", 1)[-1].split()
        and script.count("CORS_ORIGINS") == 2
        and '--update-env-vars "$update_env"' in script
    )
    results.append(report(only_api, "only the API revision receives CORS_ORIGINS"))
    results.append(
        report('update_env="^|^' in script, "the variables use an alternative gcloud delimiter (the list has commas)")
    )

    post = index(POST_CHECK_STEP)
    ordered = 0 <= index(DEPLOY_STEP) < post < index("Smoke test") < index("Move the traffic")
    results.append(report(ordered, "the revision check runs after the deployment and before any traffic moves"))
    post_step = step(POST_CHECK_STEP)
    post_env = post_step.get("env", {}) if post_step else {}
    results.append(
        report(
            post_env.get("API_REVISION") == "${{ steps.revisions.outputs.api_revision }}"
            and post_env.get("EXPECTED_CORS_ORIGINS") == "${{ steps.origins.outputs.cors_origins }}",
            "the revision check takes the revision and the expected list through env",
        )
    )

    precheck = step("Check the service variables")
    results.append(
        report(
            precheck is not None and "CORS_ORIGINS~=" in precheck["run"],
            "the check before the deployment only requires the web of this environment to be listed",
        )
    )
    return all(results)


API_OLD = {"APP_VERSION": "x", "CORS_ORIGINS": "https://mytasks-web-2195266360.europe-southwest1.run.app"}
API_NEW = {"APP_VERSION": "x", "CORS_ORIGINS": BASE + ",https://inserttask.com"}

results = [
    check_wiring(),
    run_origins_step("https://inserttask.com", "production with its domain", True),
    run_origins_step(None, "production without the variable", True),
    run_origins_step("http://inserttask.com", "an http origin stops the deployment", False, "http://inserttask.com"),
    run_origins_step("https://staging.inserttask.com", "the staging domain in production stops it", False, "https://staging.inserttask.com"),
    run_origins_step("*", "a wildcard stops the deployment", False, "*"),
    run_post_check(API_NEW, BASE + ",https://inserttask.com", "the revision has exactly the composed list", True),
    run_post_check(API_OLD, BASE + ",https://inserttask.com", "the revision still has the old value", False, "CORS_ORIGINS"),
    run_post_check({"APP_VERSION": "x"}, BASE, "the revision has no CORS_ORIGINS", False, "CORS_ORIGINS"),
    run_post_check(
        {"APP_VERSION": "x", "CORS_ORIGINS": BASE + ",https://evil.example"},
        BASE + ",https://inserttask.com",
        "the revision has an extra origin",
        False,
        "https://evil.example",
    ),
]
sys.exit(0 if all(results) else 1)
