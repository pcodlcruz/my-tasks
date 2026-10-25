#!/usr/bin/env bash
# Composes the CORS_ORIGINS list of mytasks-api for one environment (feature 005,
# contracts/pipeline-env.md section 1). Prints the list, comma separated, on stdout.
#
# The list is, in this order and without duplicates:
#   1. the run.app URL of the web of the environment,
#   2. the Firebase Hosting address of the project (<project>.web.app),
#   3. each origin of CUSTOM_WEB_ORIGINS, the optional variable of the GitHub environment
#      (separated by spaces or new lines, because a comma would split the list of variables that
#      `gcloud run deploy --update-env-vars` receives).
#
# An origin that is not `https://` plus a lower-case domain name stops the deployment before
# anything is built, naming the value. Each environment also refuses the domain of the other one:
# staging only accepts `https://staging.` origins and production none, so a copied variable
# cannot open the API of one environment to the web of the other.
#
# Inputs (environment): ENVIRONMENT, PROJECT_ID, PROJECT_NUMBER, REGION and, optionally,
# CUSTOM_WEB_ORIGINS. Run from anywhere: .github/scripts/cors-origins.sh

set -euo pipefail
# The origins come from a variable: a `*` must stay a `*` and never turn into file names.
set -f

fail() {
  echo "::error::$1" >&2
  exit 1
}

for required in ENVIRONMENT PROJECT_ID PROJECT_NUMBER REGION; do
  [ -n "${!required:-}" ] || fail "cors-origins.sh needs the variable $required"
done

case "$ENVIRONMENT" in
  staging | production) ;;
  *) fail "Unknown environment '$ENVIRONMENT' (staging or production)" ;;
esac

list="https://mytasks-web-${PROJECT_NUMBER}.${REGION}.run.app,https://${PROJECT_ID}.web.app"

domain_origin='^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
# A name, not an address: the last label (the TLD) is never numeric, which rules out IPv4 literals.
numeric_last_label='\.[0-9]+$'

# Unquoted on purpose: splitting on spaces, tabs and new lines is the point (globbing is off).
# shellcheck disable=SC2206
origins=(${CUSTOM_WEB_ORIGINS:-})

for origin in ${origins[@]+"${origins[@]}"}; do
  if ! [[ "$origin" =~ $domain_origin ]] || [[ "$origin" =~ $numeric_last_label ]]; then
    fail "Invalid origin in CUSTOM_WEB_ORIGINS: '$origin'. Each origin must be https:// plus a lower-case domain name (not an IP address), with no path, port, wildcard, comma or space."
  fi
  if [ "$ENVIRONMENT" = staging ] && [[ "$origin" != https://staging.* ]]; then
    fail "CUSTOM_WEB_ORIGINS of staging only accepts origins that start with https://staging. (got '$origin')."
  fi
  if [ "$ENVIRONMENT" = production ] && [[ "$origin" == https://staging.* ]]; then
    fail "CUSTOM_WEB_ORIGINS of production must not contain a staging origin (got '$origin')."
  fi
  case ",$list," in
    *",$origin,"*) ;;
    *) list="$list,$origin" ;;
  esac
done

printf '%s\n' "$list"
