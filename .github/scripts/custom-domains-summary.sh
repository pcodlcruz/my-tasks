#!/usr/bin/env bash
# Publishes in the job summary the state of the custom domains of the roots just applied and the name
# servers of the Cloud DNS zone, so the owner can read what to delegate without opening the console.
# The records themselves are written by Terraform in the zone; what Hosting reports as required is
# only shown as a contrast for diagnosis.
#
# Usage: custom-domains-summary.sh ROOT...
#   ROOT   directory relative to infra/ (envs/staging, envs/production). A root without a
#          `custom_domains` output (the platform one) is skipped.
#
# Only the `custom_domains` and `dns_name_servers` outputs are read, never the rest of them: both are
# public by nature (they go in the DNS). It is a convenience, so it never fails the job.

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
    servers=$(terraform -chdir="infra/$root" output -json dns_name_servers 2> /dev/null) || servers=null
    if [ "$(jq 'length' <<< "$servers" 2> /dev/null || echo 0)" -gt 0 ]; then
      echo "Name servers of the Cloud DNS zone (staging: add an NS record for the subdomain at the registrar; production: set them as the name servers of the domain):"
      echo
      jq -r '.[] | "- `\(.)`"' <<< "$servers"
      echo
    fi

    required=$(jq -r 'to_entries[] | .key as $domain | [.value.required_dns_updates[]?.desired[]?.records[]?][] | "| `\($domain)` | \(.type // "-") | `\(.domain_name // "-")` | `\(.rdata // "-")` | \(.required_action // "-") |"' <<< "$json")
    if [ -n "$required" ]; then
      echo "Records Hosting reports as required (for contrast only; the zone already holds them):"
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
