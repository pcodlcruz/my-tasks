"""Tests of the bootstrap administrator in deploy.yml (feature 003).

Two things must hold, and both are checked on the real workflow:

* the "Check the bootstrap administrator" step stops the deployment unless the GitHub
  environment defines a usable BOOTSTRAP_ADMIN_EMAIL: without it nobody could ever become
  admin of that environment;
* the API, and only the API, receives the variable when its revision is deployed.

Run from anywhere: python3 .github/scripts/tests/test_deploy_bootstrap_admin.py
"""

import os
import subprocess
import sys
from pathlib import Path

import yaml

WORKFLOW = Path(__file__).resolve().parents[2] / "workflows" / "deploy.yml"
workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
job = workflow["jobs"]["deploy"]
steps = job["steps"]


def step(name):
    return next((s for s in steps if s.get("name") == name), None)


def check_step():
    return step("Check the bootstrap administrator")


def run_check(email, label, expect_ok, expect_text=""):
    found = check_step()
    if found is None:
        print("FAIL", label, "\n  the step 'Check the bootstrap administrator' does not exist")
        return False
    env = {**os.environ, "ENVIRONMENT": "staging"}
    if email is None:
        env.pop("BOOTSTRAP_ADMIN_EMAIL", None)
    else:
        env["BOOTSTRAP_ADMIN_EMAIL"] = email
    result = subprocess.run(["bash", "-c", found["run"]], env=env, capture_output=True, text=True)
    out = result.stdout + result.stderr
    ok = (result.returncode == 0) == expect_ok and expect_text in out
    print(("pass" if ok else "FAIL"), label, "" if ok else f"\n  exit={result.returncode}\n  {out}")
    return ok


def check_wiring():
    results = []

    # The value comes from the GitHub environment variable, never from a secret or a literal.
    expected = "${{ vars.BOOTSTRAP_ADMIN_EMAIL }}"
    wired = job["env"].get("BOOTSTRAP_ADMIN_EMAIL") == expected
    print(("pass" if wired else "FAIL"), "job env reads vars.BOOTSTRAP_ADMIN_EMAIL")
    results.append(wired)

    deploy = step("Deploy the revisions without traffic")["run"]
    guard = deploy.find('if [ "$component" = api ]')
    assignment = deploy.find("BOOTSTRAP_ADMIN_EMAIL=$BOOTSTRAP_ADMIN_EMAIL")
    only_api = (
        0 <= guard < assignment
        # Its only two mentions are the assignment itself: nothing sets it on the web revision.
        and deploy.count("BOOTSTRAP_ADMIN_EMAIL") == 2
        and '--update-env-vars "$update_env"' in deploy
    )
    print(("pass" if only_api else "FAIL"), "only the API revision receives the variable")
    results.append(only_api)

    # It is set by the pipeline on every deploy, not by Terraform (cloud_run.tf ignores env).
    check_first = [s.get("name") for s in steps].index("Check the bootstrap administrator") < [
        s.get("name") for s in steps
    ].index("Deploy the revisions without traffic") if check_step() else False
    print(("pass" if check_first else "FAIL"), "the check runs before anything is deployed")
    results.append(check_first)
    return all(results)


results = [
    run_check("owner@example.com", "a normal address", True),
    run_check("Owner.Name+tag@sub.example.org", "an address with dots, plus and subdomain", True),
    run_check(None, "variable not defined", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("", "empty variable", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("   ", "blank variable", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("not-an-email", "no at sign", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("a@b", "no dot in the domain", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("a@x.com,b@x.com", "two addresses (a comma would split the gcloud list)", False, "BOOTSTRAP_ADMIN_EMAIL"),
    run_check("a b@x.com", "an address with a space", False, "BOOTSTRAP_ADMIN_EMAIL"),
    # Feature 005: the variables of the API revision are joined with `|` (gcloud alternative
    # delimiter, because the list of CORS origins has commas), so the address cannot contain it.
    run_check("a|b@x.com", "an address with the delimiter of the variable list", False, "BOOTSTRAP_ADMIN_EMAIL"),
    check_wiring(),
]
sys.exit(0 if all(results) else 1)
