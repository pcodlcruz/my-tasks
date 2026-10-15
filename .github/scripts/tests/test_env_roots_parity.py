"""The staging and production roots of Terraform must differ only in sizing and identifiers.

Both instantiate the same module. If a new argument, variable or provider setting reaches one and
not the other, the environments stop being comparable and what staging validates says less about
production (Principle IV, FR-009). This checks the files of the two roots against each other and
lists the few things that are allowed to differ.

Run from anywhere: python3 .github/scripts/tests/test_env_roots_parity.py
"""

import re
import sys
from pathlib import Path

ENVS = Path(__file__).resolve().parents[3] / "infra" / "envs"
STAGING = ENVS / "staging"
PRODUCTION = ENVS / "production"

# Arguments of `module "environment"` whose value may differ, and why.
MODULE_ARGUMENTS_THAT_DIFFER = {
    "environment": "the name of the environment",
    "terraform_service_account_email": "staging adopts its own account, production refers to the platform one",
    "deployer_service_account_email": "same as above",
    "manage_data_access_audit": "production shares its project with the platform, which owns the audit",
    "firestore_point_in_time_recovery": "production keeps 7 days of versions of the owner's tasks, staging only test data",
}
# Values of terraform.tfvars that may differ: identifiers and sizing.
TFVARS_THAT_DIFFER = {"project_id", "project_number", "api_max_instances", "web_max_instances"}
# Files that must be identical.
IDENTICAL_FILES = ["versions.tf", "providers.tf", ".terraform.lock.hcl"]

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"pass: {label}")
    else:
        print(f"FAIL: {label}{(': ' + detail) if detail else ''}")
        failures.append(label)


def module_arguments(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r'module "environment" \{(.*?)^\}', text, re.DOTALL | re.MULTILINE)
    assert match, f"no module block in {path}"
    arguments = {}
    for line in match.group(1).splitlines():
        stripped = line.split("#", 1)[0].strip()
        found = re.match(r"^([a-z_]+)\s*=\s*(.+)$", stripped)
        if found:
            arguments[found.group(1)] = found.group(2).strip()
    return arguments


def tfvars(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        found = re.match(r"^([a-z_]+)\s*=\s*(.+)$", line.split("#", 1)[0].strip())
        if found:
            values[found.group(1)] = found.group(2).strip()
    return values


def variables_without_descriptions(path: Path) -> str:
    # The descriptions name the environment; everything else must match.
    return "\n".join(
        line for line in path.read_text(encoding="utf-8").splitlines() if "description" not in line
    )


def imports(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return sorted(re.findall(r'import \{\s*to\s*=\s*(module\.[^\s]+)\s*id\s*=\s*"([^"]+)"', text))


staging_module, production_module = module_arguments(STAGING / "main.tf"), module_arguments(PRODUCTION / "main.tf")

check(
    "both roots pass the same arguments to the module",
    set(staging_module) == set(production_module),
    f"only in staging: {sorted(set(staging_module) - set(production_module))}, "
    f"only in production: {sorted(set(production_module) - set(staging_module))}",
)

for argument in sorted(set(staging_module) & set(production_module)):
    same = staging_module[argument] == production_module[argument]
    if argument in MODULE_ARGUMENTS_THAT_DIFFER:
        continue
    check(f"module argument '{argument}' is the same", same, f"{staging_module[argument]} != {production_module[argument]}")

check(
    "the arguments allowed to differ do differ (otherwise the allowance is stale)",
    all(staging_module[name] != production_module[name] for name in MODULE_ARGUMENTS_THAT_DIFFER),
)
check("production leaves the data access audit to the platform", production_module["manage_data_access_audit"] == "false")
check("staging owns its data access audit", staging_module["manage_data_access_audit"] == "true")
check("production enables point-in-time recovery", production_module["firestore_point_in_time_recovery"] == "true")
check("staging leaves point-in-time recovery off", staging_module["firestore_point_in_time_recovery"] == "false")

staging_vars, production_vars = tfvars(STAGING / "terraform.tfvars"), tfvars(PRODUCTION / "terraform.tfvars")
check("both tfvars set the same variables", set(staging_vars) == set(production_vars))
for name in sorted(set(staging_vars) & set(production_vars)):
    if name in TFVARS_THAT_DIFFER:
        check(f"tfvars '{name}' differs", staging_vars[name] != production_vars[name])
    else:
        check(f"tfvars '{name}' is the same", staging_vars[name] == production_vars[name])
check("production is sized above staging", int(production_vars["api_max_instances"]) > int(staging_vars["api_max_instances"]))

check(
    "variables.tf is the same apart from the descriptions",
    variables_without_descriptions(STAGING / "variables.tf") == variables_without_descriptions(PRODUCTION / "variables.tf"),
)
for name in IDENTICAL_FILES:
    check(f"{name} is identical", (STAGING / name).read_bytes() == (PRODUCTION / name).read_bytes())

prefixes = {
    root.name: re.search(r'prefix\s*=\s*"([^"]+)"', (root / "backend.tf").read_text(encoding="utf-8")).group(1)
    for root in (STAGING, PRODUCTION)
}
check("each root has its own state prefix, named like the root", prefixes == {"staging": "staging", "production": "production"}, str(prefixes))

check(
    "both roots adopt the Identity Platform configuration the same way",
    [item for item in imports(STAGING / "main.tf") if "identity_platform" in item[0]]
    == [item for item in imports(PRODUCTION / "main.tf") if "identity_platform" in item[0]]
    != [],
)

sys.exit(1 if failures else 0)
