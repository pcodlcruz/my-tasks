"""Tests of the "Check the service variables" step of deploy.yml.

The step is extracted from the workflow and run with a fake `gcloud` that returns services with
different variables. It must accept an environment configured for itself and reject a missing
variable or one with the value of another environment (FR-014).

Run from anywhere: python3 .github/scripts/tests/test_deploy_variable_check.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import yaml

WORKFLOW = Path(__file__).resolve().parents[2] / "workflows" / "deploy.yml"
workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
steps = workflow["jobs"]["deploy"]["steps"]
script = next(s["run"] for s in steps if s.get("name") == "Check the service variables")

ENV = {
    "ENVIRONMENT": "staging",
    "PROJECT_ID": "pdlco-mytasks-stg",
    "PROJECT_NUMBER": "838389521553",
    "REGION": "europe-southwest1",
}
WEB = "https://mytasks-web-838389521553.europe-southwest1.run.app"
API = "https://mytasks-api-838389521553.europe-southwest1.run.app"


def service(env):
    return json.dumps(
        {"spec": {"template": {"spec": {"containers": [{"env": [{"name": k, "value": v} for k, v in env.items()]}]}}}}
    )


GOOD_API = {"APP_ENV": "staging", "GOOGLE_CLOUD_PROJECT": "pdlco-mytasks-stg", "CORS_ORIGINS": WEB, "APP_VERSION": "x"}
GOOD_WEB = {
    "API_BASE_URL": API,
    "FIREBASE_API_KEY": "AIzaPublic",
    "FIREBASE_AUTH_DOMAIN": "pdlco-mytasks-stg.firebaseapp.com",
    "FIREBASE_PROJECT_ID": "pdlco-mytasks-stg",
    "USE_EMULATORS": "false",
    "APP_VERSION": "x",
}


def run(api, web, label, expect_ok, expect_text=""):
    fake = (
        "gcloud() {\n"
        '  case "$4" in\n'
        f"    mytasks-api) echo '{service(api)}' ;;\n"
        f"    mytasks-web) echo '{service(web)}' ;;\n"
        "  esac\n"
        "}\n"
    )
    result = subprocess.run(["bash", "-c", fake + script], env={**os.environ, **ENV}, capture_output=True, text=True)
    out = result.stdout + result.stderr
    ok = (result.returncode == 0) == expect_ok and expect_text in out
    print(("pass" if ok else "FAIL"), label, "" if ok else f"\n  exit={result.returncode}\n  {out}")
    return ok


results = [
    run(GOOD_API, GOOD_WEB, "all variables right", True),
    run({**GOOD_API, "APP_ENV": "production"}, GOOD_WEB, "API with another environment", False, "APP_ENV (expected 'staging')"),
    run({**GOOD_API, "CORS_ORIGINS": "https://evil.example"}, GOOD_WEB, "API with another CORS origin", False, "CORS_ORIGINS (expected"),
    run(GOOD_API, {**GOOD_WEB, "API_BASE_URL": "https://mytasks-api-2195266360.europe-southwest1.run.app"}, "web pointing at the other environment", False, "API_BASE_URL (expected"),
    run(GOOD_API, {k: v for k, v in GOOD_WEB.items() if k != "FIREBASE_PROJECT_ID"}, "web missing a variable", False, "missing required variable(s): FIREBASE_PROJECT_ID"),
    run(GOOD_API, {**GOOD_WEB, "FIREBASE_API_KEY": ""}, "web with an empty API key", False, "FIREBASE_API_KEY"),
    run(GOOD_API, {**GOOD_WEB, "USE_EMULATORS": "true"}, "web with emulators on", False, "USE_EMULATORS (expected 'false')"),
    run({k: v for k, v in GOOD_API.items() if k != "APP_VERSION"}, GOOD_WEB, "API missing APP_VERSION", False, "APP_VERSION"),
    # Feature 005: CORS_ORIGINS becomes a list the deployment itself writes. The step runs before
    # that write, so a service that still has the old single value must pass, and so must one
    # that already has the longer list; one that does not list this environment's web must not.
    run({**GOOD_API, "CORS_ORIGINS": f"{WEB},https://pdlco-mytasks-stg.web.app"}, GOOD_WEB, "API with the list already written", True),
    run({**GOOD_API, "CORS_ORIGINS": f"https://pdlco-mytasks-stg.web.app,{WEB},https://staging.inserttask.es"}, GOOD_WEB, "API with the web in the middle of the list", True),
    run({**GOOD_API, "CORS_ORIGINS": "https://pdlco-mytasks-stg.web.app,https://staging.inserttask.es"}, GOOD_WEB, "API whose list lacks the web of this environment", False, "CORS_ORIGINS (expected"),
    run({**GOOD_API, "CORS_ORIGINS": f"{WEB}.evil.example"}, GOOD_WEB, "API whose entry only starts like the web", False, "CORS_ORIGINS (expected"),
    run({**GOOD_API, "CORS_ORIGINS": "https://mytasks-web-2195266360.europe-southwest1.run.app,https://pdlco-mytasks.web.app"}, GOOD_WEB, "API holding the production list", False, "CORS_ORIGINS (expected"),
    run({k: v for k, v in GOOD_API.items() if k != "CORS_ORIGINS"}, GOOD_WEB, "API without CORS_ORIGINS", False, "missing required variable(s): CORS_ORIGINS"),
]
sys.exit(0 if all(results) else 1)
