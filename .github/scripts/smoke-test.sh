#!/usr/bin/env bash
# Smoke test of one deployed environment (contracts/pipeline.md, "Humo"). It runs against the
# revisions that do not receive traffic yet, so a failure leaves production and staging as they
# were. Every check runs and is reported, then the exit code says whether all of them passed.
#
# Inputs (environment variables):
#   API_URL           URL of the mytasks-api revision under test
#   WEB_URL           URL of the mytasks-web revision under test
#   EXPECTED_VERSION  APP_VERSION that /healthz must report
#   EXPECTED_API_URL  API URL of this environment that /config.js must contain
#   OTHER_API_URL     (optional) API URL of the other environment that /config.js must NOT contain
#
# Nothing sensitive is printed: /config.js holds the public web configuration and is only
# searched, never echoed.

set -uo pipefail

failures=0
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/smoke-test.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

pass() {
  echo "ok:   $1"
}

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "error: $name is required" >&2
    exit 2
  fi
}

# https only, apart from loopback so the script can be tested against a local server.
check_url() {
  local name="$1" value="${!1}"
  if ! [[ "$value" =~ ^https://[^/]+ ]] && ! [[ "$value" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?(/|$) ]]; then
    echo "error: $name must be an https URL" >&2
    exit 2
  fi
}

for name in API_URL WEB_URL EXPECTED_VERSION EXPECTED_API_URL; do
  require "$name"
done
for name in API_URL WEB_URL EXPECTED_API_URL; do
  check_url "$name"
done
if ! command -v jq > /dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 2
fi

api_url="${API_URL%/}"
web_url="${WEB_URL%/}"

# Prints the HTTP status and saves the body to $2. A revision that scales from zero can need a
# few seconds, hence the retries; a status other than 2xx/4xx the script asks for is not retried
# beyond that.
fetch() {
  local url="$1" body="$2"
  curl --silent --show-error --max-time 30 \
    --retry 3 --retry-delay 3 --retry-all-errors \
    --output "$body" --write-out '%{http_code}' "$url" 2> "$work_dir/curl-error" || true
}

expect_status() {
  local label="$1" url="$2" expected="$3" body="$4"
  local status
  status=$(fetch "$url" "$body")
  if [ "$status" = "$expected" ]; then
    pass "$label returned $status"
    return 0
  fi
  # curl reports 000 when no HTTP response arrived at all.
  if [ "$status" = "000" ]; then status=""; fi
  fail "$label returned ${status:-no response}, expected $expected"
  return 1
}

# API /healthz: 200 and the version this deployment is supposed to carry.
if expect_status "API /healthz" "$api_url/healthz" 200 "$work_dir/healthz"; then
  version=$(jq -r '.version // empty' "$work_dir/healthz" 2> /dev/null || true)
  if [ "$version" = "$EXPECTED_VERSION" ]; then
    pass "API /healthz reports version $EXPECTED_VERSION"
  else
    fail "API /healthz reports version '${version:-none}', expected '$EXPECTED_VERSION'"
  fi
fi

# API /readyz: the runtime identity reaches Firestore.
expect_status "API /readyz" "$api_url/readyz" 200 "$work_dir/readyz" || true

# A data endpoint must not be anonymous.
expect_status "API data endpoint without a token" "$api_url/api/v1/tasks" 401 "$work_dir/tasks" || true

# Web: the page and its runtime configuration.
expect_status "Web /" "$web_url/" 200 "$work_dir/index" || true

if expect_status "Web /config.js" "$web_url/config.js" 200 "$work_dir/config.js"; then
  if grep -qF -- "$EXPECTED_API_URL" "$work_dir/config.js"; then
    pass "Web /config.js points to the API of this environment"
  else
    fail "Web /config.js does not contain the API URL of this environment ($EXPECTED_API_URL)"
  fi
  if [ -n "${OTHER_API_URL:-}" ]; then
    if grep -qF -- "$OTHER_API_URL" "$work_dir/config.js"; then
      fail "Web /config.js contains the API URL of another environment ($OTHER_API_URL)"
    else
      pass "Web /config.js does not point to another environment"
    fi
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "smoke test failed: $failures check(s)"
  exit 1
fi
echo "smoke test passed"
