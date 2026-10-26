#!/usr/bin/env bash
# Publishes in the job summary the state of the custom domains of the roots just applied and the DNS
# records Hosting asks for, so the owner can read them without opening the Firebase console.
#
# Usage: custom-domains-summary.sh ROOT...
#   ROOT   directory relative to infra/ (envs/staging, envs/production). A root without a
#          `custom_domains` output (the platform one) is skipped.
#
# Only the `custom_domains` output is read, never the rest of them: the records are public by
# nature (they go in the DNS). It is a convenience, so it never fails the job.

set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

for root in "$@"; do
  json=$(terraform -chdir="infra/$root" output -json custom_domains 2> /dev/null) || continue
  [ "$(jq 'length' <<< "$json" 2> /dev/null || echo 0)" -gt 0 ] || continue

  {
    echo "### Custom domains of $root"
    echo
    echo "| Domain | Host | Ownership | Certificate | Issues |"
    echo "|---|---|---|---|---|"
    jq -r 'to_entries[] | "| `\(.key)` | \(.value.host_state // "-") | \(.value.ownership_state // "-") | \(.value.certificate_state // "-") | \((.value.issues // []) | length) |"' <<< "$json"
    echo
    echo "DNS records Hosting asks for (add them at the DNS provider; the TXT one must stay for good):"
    echo
    echo "| Domain | Type | Name | Value | Action |"
    echo "|---|---|---|---|---|"
    jq -r 'to_entries[] | .key as $domain | [.value.required_dns_updates[]?.desired[]?.records[]?][] | "| `\($domain)` | \(.type // "-") | `\(.domain_name // "-")` | `\(.rdata // "-")` | \(.required_action // "-") |"' <<< "$json"
    echo
  } >> "$summary"
done

exit 0
