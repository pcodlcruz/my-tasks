#!/bin/sh
# Generates the per-environment runtime files of the web image on container startup:
#   - config.js: window.__APP_CONFIG__ read by src/lib/runtimeConfig.ts
#   - security-headers.conf: nginx snippet with the Content-Security-Policy, which has to
#     allow the API of this environment and the Firebase auth domain of its project.
# The image is the same in every environment; only these environment variables change.
# Runs as the unprivileged nginx user, before nginx starts (nginx image entrypoint).

set -eu

CONFIG_JS_PATH="${CONFIG_JS_PATH:-/usr/share/nginx/html/config.js}"
HEADERS_SNIPPET_PATH="${HEADERS_SNIPPET_PATH:-/etc/nginx/snippets/security-headers.conf}"

errors=""

add_error() {
  errors="${errors}  - $1
"
}

# require <NAME> <extended regex> <what the value must look like>
# Every value ends up inside JavaScript and nginx syntax, so each one is checked against a
# strict whitelist instead of being escaped: a value that does not match is rejected.
require() {
  name=$1
  pattern=$2
  expected=$3
  eval "value=\${$name:-}"
  # grep matches line by line, so a multi-line value could hide a payload after a valid
  # first line: reject any newline before applying the pattern.
  newline='
'
  if [ -z "$value" ]; then
    add_error "$name is required but empty or unset"
  elif [ "${value#*"$newline"}" != "$value" ]; then
    add_error "$name is not valid (it must be a single line)"
  elif ! printf '%s' "$value" | grep -Eq "$pattern"; then
    add_error "$name is not valid (expected $expected)"
  fi
}

# An https origin, or http only for localhost (local docker runs). No path, no trailing slash.
require API_BASE_URL \
  '^(https://[A-Za-z0-9.-]+(:[0-9]+)?|http://(localhost|127\.0\.0\.1)(:[0-9]+)?)$' \
  "an origin such as https://mytasks-api-123.europe-southwest1.run.app, without a path"
require FIREBASE_API_KEY '^[A-Za-z0-9_-]+$' "letters, digits, '-' and '_'"
require FIREBASE_AUTH_DOMAIN '^[A-Za-z0-9.-]+$' "a host name such as project.firebaseapp.com"
require FIREBASE_PROJECT_ID '^[a-z0-9-]+$' "lowercase letters, digits and '-'"
require APP_VERSION '^[A-Za-z0-9._-]+$' "letters, digits, '.', '_' and '-'"

# The emulators (and the e2e test login) only exist in local development.
if [ -n "${USE_EMULATORS:-}" ] && [ "${USE_EMULATORS}" != "false" ]; then
  add_error "USE_EMULATORS must be unset or 'false' in a deployed image (got a different value)"
fi

if [ -n "$errors" ]; then
  printf 'ERROR: invalid runtime configuration for mytasks-web:\n%s' "$errors" >&2
  printf 'Set the variables on the service and redeploy. No files were written.\n' >&2
  exit 1
fi

# Written in place: nginx has not started yet, so nobody can read a half-written file, and
# the nginx user may only write config.js itself, not create files next to it.
cat >"$CONFIG_JS_PATH" <<EOF
// Generated on container startup from the service environment. Public values only.
window.__APP_CONFIG__ = Object.freeze({
  API_BASE_URL: '${API_BASE_URL}',
  FIREBASE_API_KEY: '${FIREBASE_API_KEY}',
  FIREBASE_AUTH_DOMAIN: '${FIREBASE_AUTH_DOMAIN}',
  FIREBASE_PROJECT_ID: '${FIREBASE_PROJECT_ID}',
  APP_VERSION: '${APP_VERSION}',
  USE_EMULATORS: 'false',
})
EOF

# script-src: Firebase's popup sign-in loads the Google API loader. frame-src: the auth
# handler iframe lives on the project's auth domain. style-src needs no 'unsafe-inline':
# the app ships a stylesheet and uses no inline styles.
csp="default-src 'self'; \
script-src 'self' https://apis.google.com; \
style-src 'self'; \
img-src 'self' data:; \
font-src 'self'; \
connect-src 'self' ${API_BASE_URL} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; \
frame-src https://${FIREBASE_AUTH_DOMAIN} https://accounts.google.com; \
object-src 'none'; \
base-uri 'self'; \
form-action 'self'; \
frame-ancestors 'none'"

cat >"$HEADERS_SNIPPET_PATH" <<EOF
add_header Content-Security-Policy "${csp}" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
EOF

printf 'mytasks-web runtime config written (version %s, API %s)\n' "$APP_VERSION" "$API_BASE_URL"
