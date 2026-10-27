#!/usr/bin/env bash
# Publishes in the job summary the state of the custom domains of the roots just applied, so the
# owner can read it without opening the console. The DNS records live in the registrar, kept by hand
# (infra/RUNBOOK.md lists them); what Hosting reports as required is shown for diagnosis, to compare
# with what the registrar holds.
#
# Usage: custom-domains-summary.sh ROOT...
#   ROOT   directory relative to infra/ (envs/staging, envs/production). A root without a
#          `custom_domains` output (the platform one) is skipped.
#
# Only the `custom_domains` output is read, never the rest of them: it is public by nature (it goes
# in the DNS). It is a convenience, so it never fails the job.

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

    required=$(jq -r 'to_entries[] | .key as $domain | [.value.required_dns_updates[]?.desired[]?.records[]?][] | "| `\($domain)` | \(.type // "-") | `\(.domain_name // "-")` | `\(.rdata // "-")` | \(.required_action // "-") |"' <<< "$json")
    if [ -n "$required" ]; then
      echo "Records Hosting reports as required (compare them with the DNS of the registrar):"
      echo
      echo "| Domain | Type | Name | Value | Action |"
      echo "|---|---|---|---|---|"
      echo "$required"
    else
      echo "Hosting has not reported any required record yet (expected right after the domain is created)."
    fi
    echo
  } >> "$summary"
done

exit 0
