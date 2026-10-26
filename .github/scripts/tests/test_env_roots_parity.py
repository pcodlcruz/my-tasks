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
# Arguments that each environment fills with its own values but that need not differ (feature 005:
# the custom domains each environment serves; both start empty and the phase 4 fills them in).
MODULE_ARGUMENTS_THAT_MAY_DIFFER = {
    "custom_domains": "each environment serves its own domains (staging a rehearsal one)",
}
# Values of terraform.tfvars that may differ: identifiers and sizing.
TFVARS_THAT_DIFFER = {"project_id", "project_number", "api_max_instances", "web_max_instances"}
# Files that must be identical.
IDENTICAL_FILES = ["versions.tf", "providers.tf", "outputs.tf", ".terraform.lock.hcl"]

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
    if argument in MODULE_ARGUMENTS_THAT_DIFFER or argument in MODULE_ARGUMENTS_THAT_MAY_DIFFER:
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

# --- Feature 005: Firebase Hosting needs the google-beta provider (the GA one has no
# google_firebase_hosting_* resources). It must be pinned like google, configured like google and
# handed to the module, in both environments.
MODULE = ENVS.parent / "modules" / "environment"


def provider_block(path: Path, name: str) -> str | None:
    match = re.search(rf'provider "{name}" \{{(.*?)^\}}', path.read_text(encoding="utf-8"), re.DOTALL | re.MULTILINE)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else None


for label, versions in (
    ("the module", MODULE / "versions.tf"),
    ("the staging root", STAGING / "versions.tf"),
    ("the production root", PRODUCTION / "versions.tf"),
):
    text = versions.read_text(encoding="utf-8")
    check(
        f"{label} pins google-beta to the same line as google",
        bool(re.search(r'source\s*=\s*"hashicorp/google-beta"\s*version\s*=\s*"~> 8\.6\.0"', text)),
    )

google, beta = provider_block(STAGING / "providers.tf", "google"), provider_block(STAGING / "providers.tf", "google-beta")
check("the roots configure google-beta exactly like google", beta is not None and beta == google, f"{beta!r} != {google!r}")
check(
    "both roots hand both providers to the module",
    all(
        "providers" in module and "google-beta = google-beta" in module["providers"] and "google = google" in module["providers"]
        for module in (staging_module, production_module)
    ),
)
check(
    "both roots pass the custom domains to the module",
    "custom_domains" in staging_module and "custom_domains" in production_module,
)

# --- Feature 005, phase 4: the domains each environment serves. Same shape in both roots, only the
# values differ: staging serves a rehearsal subdomain, production the canonical domain and www.
CUSTOM_DOMAIN_FIELDS = {"domain", "redirect_to"}
EXPECTED_DOMAINS = {
    "staging": {"staging.inserttask.com": None},
    "production": {"inserttask.com": None, "www.inserttask.com": "inserttask.com"},
}


def custom_domains(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    block = re.search(r"^\s*custom_domains\s*=\s*\[(.*?)\]", re.sub(r"#.*", "", text), re.DOTALL | re.MULTILINE)
    assert block, f"no custom_domains list in {path}"
    items = []
    for body in re.findall(r"\{([^{}]*)\}", re.sub(r"#.*", "", block.group(1))):
        items.append(dict(re.findall(r'([a-z_]+)\s*=\s*"([^"]*)"', body)))
    return items


domains = {root.name: custom_domains(root / "main.tf") for root in (STAGING, PRODUCTION)}
for name, items in domains.items():
    check(
        f"the {name} root declares only the fields the module accepts",
        bool(items) and all(set(item) <= CUSTOM_DOMAIN_FIELDS and "domain" in item for item in items),
        str(items),
    )
    check(
        f"the {name} root serves exactly its own domains",
        {item.get("domain"): item.get("redirect_to") for item in items} == EXPECTED_DOMAINS[name],
        str(items),
    )
check(
    "no domain is declared in both environments",
    not ({item["domain"] for item in domains["staging"]} & {item["domain"] for item in domains["production"]}),
)

# The module declares one custom domain resource per item, on the beta provider, without waiting for
# the DNS (the owner puts the records after the apply), and exposes the state of each one.
hosting_tf = (MODULE / "hosting.tf").read_text(encoding="utf-8")
domain_resource = re.search(r'resource "google_firebase_hosting_custom_domain" "web" \{(.*?)^\}', hosting_tf, re.DOTALL | re.MULTILINE)
check("hosting.tf declares the custom domain resource", domain_resource is not None)
resource_text = domain_resource.group(1) if domain_resource else ""
check("the custom domain resource iterates over var.custom_domains", "for_each" in resource_text and "var.custom_domains" in resource_text)
check("the custom domain resource uses the beta provider", bool(re.search(r"provider\s*=\s*google-beta", resource_text)))
check("the custom domain resource does not wait for the DNS", bool(re.search(r"wait_dns_verification\s*=\s*false", resource_text)))
check("the custom domain resource follows the redirect_to of each domain", "redirect_target" in resource_text and "redirect_to" in resource_text)
check("the custom domain resource is protected against destroy", bool(re.search(r"prevent_destroy\s*=\s*true", resource_text)))
outputs_tf = (MODULE / "outputs.tf").read_text(encoding="utf-8")
check(
    "the module outputs the state and the required DNS records of each domain",
    all(word in outputs_tf for word in ("host_state", "ownership_state", "required_dns_updates", "issues")),
)

sys.exit(1 if failures else 0)
