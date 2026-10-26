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

# Fake terraform: `output -json custom_domains` prints outputs/<root>.json, or fails when the file
# does not exist (a root without that output).
cat > "$work/bin/terraform" << 'EOF'
#!/usr/bin/env bash
dir="${1#-chdir=}"; shift
file="$FAKE_OUTPUTS/$(basename "$dir").json"
[ "$1" = output ] && [ -f "$file" ] && { cat "$file"; exit 0; }
echo "Error: Output \"custom_domains\" not found" >&2
exit 1
EOF
chmod +x "$work/bin/terraform"
mkdir -p "$work/outputs"

cat > "$work/outputs/production.json" << 'EOF'
{
  "inserttask.com": {
    "host_state": "HOST_UNHOSTED",
    "ownership_state": "OWNERSHIP_PENDING",
    "certificate_state": null,
    "issues": [],
    "required_dns_updates": [
      {"desired": [{"domain_name": "inserttask.com", "records": [
        {"domain_name": "inserttask.com", "type": "TXT", "rdata": "hosting-site=abc", "required_action": "ADD"},
        {"domain_name": "inserttask.com", "type": "A", "rdata": "199.36.158.100", "required_action": "ADD"}
      ]}]}
    ]
  },
  "www.inserttask.com": {
    "host_state": "HOST_UNHOSTED",
    "ownership_state": "OWNERSHIP_PENDING",
    "certificate_state": null,
    "issues": [{"code": "x"}],
    "required_dns_updates": []
  }
}
EOF

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
check "the summary lists each domain with its states" 'has "| \`inserttask.com\` | HOST_UNHOSTED | OWNERSHIP_PENDING |" && has "| \`www.inserttask.com\` | HOST_UNHOSTED | OWNERSHIP_PENDING | - | 1 |"'
check "the summary lists the TXT and A records to add" 'has "| TXT | \`inserttask.com\` | \`hosting-site=abc\` | ADD |" && has "| A | \`inserttask.com\` | \`199.36.158.100\` | ADD |"'
check "the script succeeds" '[ "$code" -eq 0 ]'

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
