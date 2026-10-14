#!/usr/bin/env bash
# Tests of smoke-test.sh against a fake environment (fake_server.py). The smoke test is the gate
# before any traffic moves, so what matters is that each fault makes it fail and that a healthy
# environment makes it pass.
#
# Run from anywhere: .github/scripts/tests/test-smoke-test.sh

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
smoke="$here/../smoke-test.sh"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/test-smoke-test.XXXXXX")
server_pid=""
failures=0

stop_server() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2> /dev/null
    wait "$server_pid" 2> /dev/null
    server_pid=""
  fi
}

cleanup() {
  stop_server
  rm -rf "$work_dir"
}
trap cleanup EXIT

start_server() {
  stop_server
  : > "$work_dir/port"
  FAKE_MODE="$1" python3 -I "$here/fake_server.py" > "$work_dir/port" &
  server_pid=$!
  for _ in $(seq 1 50); do
    [ -s "$work_dir/port" ] && break
    sleep 0.1
  done
  port=$(head -n 1 "$work_dir/port")
}

# run_smoke MODE EXPECTED_EXIT "text the output must contain" [extra env assignments...]
run_smoke() {
  local mode="$1" expected_exit="$2" expected_text="$3"
  shift 3
  start_server "$mode"
  local base="http://127.0.0.1:$port" output code
  output=$(env API_URL="$base" WEB_URL="$base" EXPECTED_VERSION=abc123 \
    EXPECTED_API_URL="$base" OTHER_API_URL="https://mytasks-api-other.example.run.app" \
    "$@" "$smoke" 2>&1)
  code=$?
  if [ "$code" -eq "$expected_exit" ] && grep -qF -- "$expected_text" <<< "$output"; then
    echo "pass: $mode (exit $code)"
  else
    echo "FAIL: $mode: exit $code (expected $expected_exit), wanted '$expected_text'"
    echo "$output" | sed 's/^/      /'
    failures=$((failures + 1))
  fi
}

run_smoke healthy 0 "smoke test passed"
run_smoke wrong-version 1 "reports version 'other', expected 'abc123'"
run_smoke not-ready 1 "API /readyz returned 503, expected 200"
run_smoke anonymous-data 1 "data endpoint without a token returned 200, expected 401"
run_smoke web-down 1 "Web / returned 500, expected 200"
run_smoke config-wrong-api 1 "does not contain the API URL of this environment"
run_smoke config-both 1 "contains the API URL of another environment"

# Every fault is reported, not only the first one.
start_server not-ready
base="http://127.0.0.1:$port"
output=$(API_URL="$base" WEB_URL="$base" EXPECTED_VERSION=nope EXPECTED_API_URL="$base" "$smoke" 2>&1)
if grep -qF "reports version" <<< "$output" && grep -qF "/readyz returned 503" <<< "$output" \
  && grep -qF "failed: 2 check(s)" <<< "$output"; then
  echo "pass: all faults are reported"
else
  echo "FAIL: all faults are reported"
  echo "$output" | sed 's/^/      /'
  failures=$((failures + 1))
fi

# Inputs are validated before anything is requested.
if API_URL="" WEB_URL=x EXPECTED_VERSION=1 EXPECTED_API_URL=x "$smoke" > /dev/null 2>&1; then
  echo "FAIL: a missing input is rejected"
  failures=$((failures + 1))
else
  echo "pass: a missing input is rejected"
fi
if API_URL="http://example.com" WEB_URL="http://example.com" EXPECTED_VERSION=1 \
  EXPECTED_API_URL="http://example.com" "$smoke" > /dev/null 2>&1; then
  echo "FAIL: a non-https URL is rejected"
  failures=$((failures + 1))
else
  echo "pass: a non-https URL is rejected"
fi

# An unreachable environment fails instead of passing by default.
unreachable="http://127.0.0.1:9"
output=$(API_URL="$unreachable" WEB_URL="$unreachable" EXPECTED_VERSION=1 \
  EXPECTED_API_URL="$unreachable" "$smoke" 2>&1)
code=$?
# Exit 1 with "no response" proves the checks ran and failed; exit 2 would be a rejected input.
if [ "$code" -eq 1 ] && grep -qF "returned no response" <<< "$output"; then
  echo "pass: an unreachable environment fails"
else
  echo "FAIL: an unreachable environment fails (exit $code)"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed"
  exit 1
fi
echo "all tests passed"
