#!/usr/bin/env bash
# Tests of custom-domains-summary.sh with a fake terraform. What matters: the records Hosting asks
# for end up in the job summary, a root without the output is skipped, and the script never fails
# the job.
#
# Run from anywhere: .github/scripts/tests/test-custom-domains-summary.sh

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/../custom-domains-summary.sh"
work=$(mktemp -d "${TMPDIR:-/tmp}/test-custom-domains-summary.XXXXXX")
trap 'rm -rf "$work"' EXIT
failures=0

mkdir -p "$work/bin"

# Fake terraform: `output -json custom_domains` prints outputs/<root>.json and `output -json
# dns_name_servers` prints outputs/<root>.ns.json; both fail when the file does not exist (a root
# without that output).
cat > "$work/bin/terraform" << 'EOF'
#!/usr/bin/env bash
dir="${1#-chdir=}"; shift
file="$FAKE_OUTPUTS/$(basename "$dir").json"
[ "$3" = dns_name_servers ] && file="$FAKE_OUTPUTS/$(basename "$dir").ns.json"
[ "$1" = output ] && [ -f "$file" ] && { cat "$file"; exit 0; }
echo "Error: Output \"custom_domains\" not found" >&2
exit 1
EOF
chmod +x "$work/bin/terraform"
mkdir -p "$work/outputs"

cat > "$work/outputs/production.json" << 'EOF'
{
  "inserttask.es": {
    "host_state": "HOST_UNHOSTED",
    "ownership_state": "OWNERSHIP_PENDING",
    "certificate_state": null,
    "issues": [],
    "required_dns_updates": [
      {"desired": [{"domain_name": "inserttask.es", "records": [
        {"domain_name": "inserttask.es", "type": "TXT", "rdata": "hosting-site=abc", "required_action": "ADD"},
        {"domain_name": "inserttask.es", "type": "A", "rdata": "199.36.158.100", "required_action": "ADD"}
      ]}]}
    ]
  },
  "www.inserttask.es": {
    "host_state": "HOST_UNHOSTED",
    "ownership_state": "OWNERSHIP_PENDING",
    "certificate_state": null,
    "issues": [{"code": "x"}],
    "required_dns_updates": []
  }
}
EOF

echo '["ns-cloud-a1.googledomains.com.", "ns-cloud-a2.googledomains.com."]' > "$work/outputs/production.ns.json"

check() {
  local label="$1" condition="$2"
  if eval "$condition"; then
    echo "pass: $label"
  else
    echo "FAIL: $label (exit $code)"
    echo "      summary: $summary_text"
    failures=$((failures + 1))
  fi
}

run() {
  : > "$work/summary"
  (cd "$work" && env PATH="$work/bin:$PATH" FAKE_OUTPUTS="$work/outputs" GITHUB_STEP_SUMMARY="$work/summary" "$script" "$@") > /dev/null 2>&1
  code=$?
  summary_text=$(cat "$work/summary")
}

has() { grep -qF -- "$1" <<< "$summary_text"; }

run envs/production
check "the summary lists each domain with its states" 'has "| \`inserttask.es\` | HOST_UNHOSTED | OWNERSHIP_PENDING |" && has "| \`www.inserttask.es\` | HOST_UNHOSTED | OWNERSHIP_PENDING | - | 1 |"'
check "the summary lists the TXT and A records to add" 'has "| TXT | \`inserttask.es\` | \`hosting-site=abc\` | ADD |" && has "| A | \`inserttask.es\` | \`199.36.158.100\` | ADD |"'
check "the summary lists the name servers of the zone" 'has "- \`ns-cloud-a1.googledomains.com.\`" && has "- \`ns-cloud-a2.googledomains.com.\`"'
check "the script succeeds" '[ "$code" -eq 0 ]'

# Without records from Hosting (right after the creation) the summary says so instead of an empty table.
python3 - "$work/outputs/production.json" << 'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
for item in data.values():
    item["required_dns_updates"] = []
json.dump(data, open(path.replace("production", "empty"), "w"))
PY
cp "$work/outputs/empty.json" "$work/outputs/staging.json"
run envs/staging
check "no required records from Hosting: the summary says so" 'has "Hosting has not reported any required record yet" && ! has "| Domain | Type | Name |"'
check "a root without the name servers output still lists its domains" 'has "Custom domains of envs/staging" && ! has "Name servers"'

run platform
check "a root without the output is skipped and writes nothing" '[ "$code" -eq 0 ] && [ -z "$summary_text" ]'

echo '{}' > "$work/outputs/staging.json"
run envs/staging
check "a root without domains writes nothing" '[ "$code" -eq 0 ] && [ -z "$summary_text" ]'

run envs/production platform envs/staging
check "several roots in one call: only the one with domains is written" '[ "$code" -eq 0 ] && grep -q "Custom domains of envs/production" <<< "$summary_text" && ! grep -q "envs/staging" <<< "$summary_text"'

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
