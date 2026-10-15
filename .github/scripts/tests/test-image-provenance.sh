#!/usr/bin/env bash
# Tests of image-provenance.sh with a fake docker. What matters: an image is accepted only when
# its labels say this pipeline built it for this component and this tree hash, every other case
# (missing labels, other hash, other component, unreadable image) fails naming the cause, and
# `stamp` adds exactly those labels on top of the source image and pushes the result.
#
# Run from anywhere: .github/scripts/tests/test-image-provenance.sh

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/../image-provenance.sh"
work=$(mktemp -d "${TMPDIR:-/tmp}/test-image-provenance.XXXXXX")
trap 'rm -rf "$work"' EXIT
failures=0

mkdir -p "$work/bin" "$work/images"

# Fake docker. `buildx imagetools inspect REF` prints images/<REF with / and : as _>.json, or
# fails if the file does not exist. `build` records its arguments and the Dockerfile it read from
# stdin; `push` is logged. FAKE_BUILD_FAIL / FAKE_PUSH_FAIL make those commands fail.
cat > "$work/bin/docker" << 'EOF'
#!/usr/bin/env bash
cmd="$1"; shift
case "$cmd" in
  buildx)
    # buildx imagetools inspect REF --format ...
    ref="$3"
    file="$FAKE_IMAGES/$(tr '/:@' '___' <<< "$ref").json"
    if [ ! -f "$file" ]; then echo "ERROR: $ref: not found"; exit 1; fi
    cat "$file"
    ;;
  build)
    echo "build $*" >> "$FAKE_LOG"
    echo "dockerfile: $(cat)" >> "$FAKE_LOG"
    [ -n "${FAKE_BUILD_FAIL:-}" ] && exit 1
    exit 0
    ;;
  push)
    echo "push $*" >> "$FAKE_LOG"
    [ -n "${FAKE_PUSH_FAIL:-}" ] && exit 1
    exit 0
    ;;
esac
EOF
chmod +x "$work/bin/docker"

export PATH="$work/bin:$PATH"
export FAKE_IMAGES="$work/images"
export FAKE_LOG="$work/log"

hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
other=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
commit=cccccccccccccccccccccccccccccccccccccccc
ref="europe-southwest1-docker.pkg.dev/p/mytasks/mytasks-api@sha256:$(printf 'd%.0s' {1..64})"
file="$work/images/$(tr '/:@' '___' <<< "$ref").json"

# Writes the configuration of the fake image: labels given as a JSON object.
image() { printf '{"config":{"Labels":%s}}\n' "$1" > "$file"; }

good_labels() {
  printf '{"io.mytasks.component":"%s","io.mytasks.tree-hash":"%s","io.mytasks.built-by":"deploy.yml","io.mytasks.pipeline-run":"42","org.opencontainers.image.revision":"%s"}' "$1" "$2" "$commit"
}

# expect NAME EXPECTED_EXIT [TEXT_IN_OUTPUT] -- COMMAND...
expect() {
  local name="$1" want="$2" text="$3"
  shift 4
  local out code
  out=$("$@" 2>&1)
  code=$?
  if [ "$code" != "$want" ]; then
    echo "FAIL $name: exit $code, expected $want"
    echo "$out" | sed 's/^/  | /'
    failures=$((failures + 1))
    return
  fi
  if [ -n "$text" ] && ! grep -qF -- "$text" <<< "$out"; then
    echo "FAIL $name: output does not contain '$text'"
    echo "$out" | sed 's/^/  | /'
    failures=$((failures + 1))
    return
  fi
  echo "ok   $name"
}

# --- verify ---

image "$(good_labels api "$hash")"
expect "accepts an image built for this component and hash" 0 "provenance ok" -- \
  "$script" verify api "$hash" "$ref"

image '{}'
expect "rejects an image without labels" 1 "label io.mytasks.tree-hash is '<missing>'" -- \
  "$script" verify api "$hash" "$ref"

image "$(good_labels api "$other")"
expect "rejects another tree hash" 1 "label io.mytasks.tree-hash is '$other'" -- \
  "$script" verify api "$hash" "$ref"

image "$(good_labels web "$hash")"
expect "rejects another component" 1 "label io.mytasks.component is 'web'" -- \
  "$script" verify api "$hash" "$ref"

printf '{"config":{"Labels":{"io.mytasks.component":"api","io.mytasks.tree-hash":"%s","io.mytasks.built-by":"someone-else","org.opencontainers.image.revision":"%s"}}}\n' \
  "$hash" "$commit" > "$file"
expect "rejects an image not built by the pipeline" 1 "label io.mytasks.built-by is 'someone-else'" -- \
  "$script" verify api "$hash" "$ref"

printf '{"config":{"Labels":{"io.mytasks.component":"api","io.mytasks.tree-hash":"%s","io.mytasks.built-by":"deploy.yml","org.opencontainers.image.revision":"main"}}}\n' \
  "$hash" > "$file"
expect "rejects a revision that is not a commit" 1 "org.opencontainers.image.revision is 'main'" -- \
  "$script" verify api "$hash" "$ref"

printf '{"config":{}}\n' > "$file"
expect "rejects an image whose configuration has no labels at all" 1 "Provenance check failed" -- \
  "$script" verify api "$hash" "$ref"

printf '{"linux/amd64":{"config":{"Labels":%s}}}\n' "$(good_labels api "$hash")" > "$file"
expect "reads the amd64 configuration of an index" 0 "provenance ok" -- \
  "$script" verify api "$hash" "$ref"

rm -f "$file"
expect "fails when the image cannot be read" 1 "Cannot read the image" -- \
  "$script" verify api "$hash" "$ref"

image "$(good_labels api "$hash")"
expect "rejects an unknown component" 2 "Unknown component" -- \
  "$script" verify db "$hash" "$ref"
expect "rejects a hash that is not a tree hash" 2 "is not a Git tree hash" -- \
  "$script" verify api "latest" "$ref"
expect "needs all its arguments" 2 "" -- "$script" verify api "$hash"

# --- stamp ---

: > "$FAKE_LOG"
expect "stamp builds on the source image and pushes the target" 0 "" -- \
  env COMMIT="$commit" RUN_ID=42 "$script" stamp api "$hash" "reg/mytasks-api:build-1" "reg/mytasks-api:$hash"
for want in \
  "dockerfile: FROM reg/mytasks-api:build-1" \
  "io.mytasks.component=api" \
  "io.mytasks.tree-hash=$hash" \
  "io.mytasks.built-by=deploy.yml" \
  "io.mytasks.pipeline-run=42" \
  "org.opencontainers.image.revision=$commit" \
  "--tag reg/mytasks-api:$hash" \
  "push reg/mytasks-api:$hash"; do
  if grep -qF -- "$want" "$FAKE_LOG"; then
    echo "ok   stamp logged: $want"
  else
    echo "FAIL stamp did not log: $want"
    sed 's/^/  | /' "$FAKE_LOG"
    failures=$((failures + 1))
  fi
done

: > "$FAKE_LOG"
expect "stamp needs the full commit SHA" 2 "COMMIT must be the full SHA" -- \
  env COMMIT=abc RUN_ID=42 "$script" stamp api "$hash" src dst
expect "stamp needs a numeric run id" 2 "RUN_ID must be the numeric id" -- \
  env COMMIT="$commit" RUN_ID='4; rm -rf /' "$script" stamp api "$hash" src dst
if grep -q . "$FAKE_LOG"; then
  echo "FAIL stamp ran docker with invalid input"
  failures=$((failures + 1))
else
  echo "ok   stamp does not run docker with invalid input"
fi

expect "stamp fails when the build fails" 1 "Could not add the provenance labels" -- \
  env COMMIT="$commit" RUN_ID=42 FAKE_BUILD_FAIL=1 "$script" stamp api "$hash" src dst
: > "$FAKE_LOG"
expect "stamp fails when the push fails" 1 "" -- \
  env COMMIT="$commit" RUN_ID=42 FAKE_PUSH_FAIL=1 "$script" stamp web "$hash" src dst

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed"
  exit 1
fi
echo "all tests passed"
