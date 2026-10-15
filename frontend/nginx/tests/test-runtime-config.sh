#!/bin/sh
# Tests for nginx/docker-entrypoint.d/40-runtime-config.sh.
# Plain POSIX sh so they run anywhere (CI runner, Alpine) without extra tooling.
# Usage: sh nginx/tests/test-runtime-config.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/../docker-entrypoint.d/40-runtime-config.sh"
# An explicit template: BSD mktemp (macOS) ignores $TMPDIR without one.
WORK=$(mktemp -d "${TMPDIR:-/tmp}/runtime-config-test.XXXXXX") || exit 2
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
CASES=0

# Valid environment, overridden per case with `env VAR=value`.
VALID_ENV="API_BASE_URL=https://mytasks-api-123.europe-southwest1.run.app
FIREBASE_API_KEY=AIzaSyPublicKey-123_abc
FIREBASE_AUTH_DOMAIN=mytasks-stg.firebaseapp.com
FIREBASE_PROJECT_ID=mytasks-stg
APP_VERSION=3f9c2ab"

# run_script <extra env assignments...>: runs the script with VALID_ENV plus overrides
# (an override with an empty value or the word UNSET removes the variable).
run_script() {
  rm -f "$WORK/config.js" "$WORK/security-headers.conf"
  (
    for assignment in $VALID_ENV; do
      export "${assignment?}"
    done
    for override in "$@"; do
      name=${override%%=*}
      value=${override#*=}
      if [ "$value" = "UNSET" ]; then unset "$name"; else export "$name=$value"; fi
    done
    CONFIG_JS_PATH="$WORK/config.js" \
      HEADERS_SNIPPET_PATH="$WORK/security-headers.conf" \
      sh "$SCRIPT"
  ) >"$WORK/stdout" 2>"$WORK/stderr"
  return $?
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: %s\n' "$1"
}

pass() {
  printf 'ok:   %s\n' "$1"
}

expect_success() {
  CASES=$((CASES + 1))
  description=$1
  shift
  if run_script "$@"; then pass "$description"; else fail "$description (exit $?, stderr: $(cat "$WORK/stderr"))"; fi
}

expect_failure_naming() {
  CASES=$((CASES + 1))
  description=$1
  expected=$2
  shift 2
  if run_script "$@"; then
    fail "$description (should have failed)"
  elif grep -q -- "$expected" "$WORK/stderr"; then
    pass "$description"
  else
    fail "$description (stderr does not mention '$expected': $(cat "$WORK/stderr"))"
  fi
}

expect_file_contains() {
  CASES=$((CASES + 1))
  description=$1
  file=$2
  expected=$3
  if grep -qF -- "$expected" "$file"; then pass "$description"; else fail "$description (missing: $expected)"; fi
}

expect_file_lacks() {
  CASES=$((CASES + 1))
  description=$1
  file=$2
  unexpected=$3
  if grep -qF -- "$unexpected" "$file"; then fail "$description (found: $unexpected)"; else pass "$description"; fi
}

# --- all variables present -------------------------------------------------------

expect_success "succeeds with every required variable"
expect_file_contains "config.js carries the API url" "$WORK/config.js" \
  "API_BASE_URL: 'https://mytasks-api-123.europe-southwest1.run.app'"
expect_file_contains "config.js carries the Firebase project" "$WORK/config.js" \
  "FIREBASE_PROJECT_ID: 'mytasks-stg'"
expect_file_contains "config.js carries the version" "$WORK/config.js" "APP_VERSION: '3f9c2ab'"
expect_file_contains "config.js forces the emulators off" "$WORK/config.js" "USE_EMULATORS: 'false'"
expect_file_contains "CSP allows the API origin" "$WORK/security-headers.conf" \
  "connect-src 'self' https://mytasks-api-123.europe-southwest1.run.app"
expect_file_contains "CSP allows the Firebase auth domain frame" "$WORK/security-headers.conf" \
  "frame-src https://mytasks-stg.firebaseapp.com"
expect_file_contains "CSP forbids framing" "$WORK/security-headers.conf" "frame-ancestors 'none'"
expect_file_contains "headers disable MIME sniffing" "$WORK/security-headers.conf" \
  "X-Content-Type-Options"
expect_file_contains "headers set a referrer policy" "$WORK/security-headers.conf" "Referrer-Policy"

# --- a variable is missing ----------------------------------------------------------

for variable in API_BASE_URL FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID APP_VERSION; do
  expect_failure_naming "fails and names $variable when it is unset" "$variable" "$variable=UNSET"
  expect_failure_naming "fails and names $variable when it is empty" "$variable" "$variable="
done

expect_failure_naming "names every missing variable at once (1/2)" "API_BASE_URL" \
  "API_BASE_URL=UNSET" "APP_VERSION=UNSET"
expect_failure_naming "names every missing variable at once (2/2)" "APP_VERSION" \
  "API_BASE_URL=UNSET" "APP_VERSION=UNSET"

CASES=$((CASES + 1))
run_script "API_BASE_URL=UNSET"
if [ -e "$WORK/config.js" ]; then fail "does not write config.js when a variable is missing"; else pass "does not write config.js when a variable is missing"; fi

# --- the emulators can never be switched on -------------------------------------------

expect_failure_naming "rejects USE_EMULATORS=true" "USE_EMULATORS" "USE_EMULATORS=true"
expect_success "accepts USE_EMULATORS=false" "USE_EMULATORS=false"

# --- values are validated so they cannot inject JavaScript or nginx directives -----------

expect_failure_naming "rejects a quote in API_BASE_URL" "API_BASE_URL" \
  "API_BASE_URL=https://a.example.com'};alert(1);//"
expect_failure_naming "rejects a path in API_BASE_URL" "API_BASE_URL" \
  "API_BASE_URL=https://api.example.com/v1"
expect_failure_naming "rejects a trailing slash in API_BASE_URL" "API_BASE_URL" \
  "API_BASE_URL=https://api.example.com/"
expect_failure_naming "rejects plain http outside localhost" "API_BASE_URL" \
  "API_BASE_URL=http://api.example.com"
expect_success "accepts http on localhost" "API_BASE_URL=http://localhost:8000"
expect_failure_naming "rejects a semicolon in FIREBASE_AUTH_DOMAIN" "FIREBASE_AUTH_DOMAIN" \
  "FIREBASE_AUTH_DOMAIN=a.example.com;add_header X 1"
expect_failure_naming "rejects spaces in APP_VERSION" "APP_VERSION" "APP_VERSION=1 2"
expect_failure_naming "rejects a quote in FIREBASE_API_KEY" "FIREBASE_API_KEY" \
  "FIREBASE_API_KEY=abc\"def"
# grep matches line by line: a valid first line must not let an injected second line through.
NEWLINE_INJECTION="APP_VERSION=1.0.0
'});alert(1);//"
expect_failure_naming "rejects a newline in APP_VERSION" "APP_VERSION" "$NEWLINE_INJECTION"

# --- no secret is written or echoed ----------------------------------------------------------

expect_success "a valid run succeeds"
CASES=$((CASES + 1))
if grep -q "AIzaSyPublicKey" "$WORK/stdout" "$WORK/stderr"; then
  fail "does not print the API key to the logs"
else
  pass "does not print the API key to the logs"
fi

printf '\n%s checks, %s failed\n' "$CASES" "$FAILURES"
[ "$FAILURES" -eq 0 ]
