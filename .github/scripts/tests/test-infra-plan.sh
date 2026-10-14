#!/usr/bin/env bash
# Tests of infra-plan.sh with a fake terraform and gcloud. What matters: a plan that fails fails
# the job, a preview never does, the digest ignores refresh noise but not the planned actions,
# and a changed plan is refused before anything is applied.
#
# Run from anywhere: .github/scripts/tests/test-infra-plan.sh

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/../infra-plan.sh"
work=$(mktemp -d "${TMPDIR:-/tmp}/test-infra-plan.XXXXXX")
trap 'rm -rf "$work"' EXIT
failures=0

mkdir -p "$work/bin" "$work/plans" "$work/project/infra/platform" "$work/project/infra/envs/staging" \
  "$work/project/infra/envs/production"

# Fake terraform: init succeeds unless FAKE_INIT_FAIL names the root; plan prints plans/<root>.txt
# and exits with plans/<root>.code. Every call is logged.
cat > "$work/bin/terraform" << 'EOF'
#!/usr/bin/env bash
dir="${1#-chdir=}"; shift
cmd="$1"; shift
name=$(basename "$dir")
echo "$name $cmd $*" >> "$FAKE_LOG"
[ -f "$dir/backend_override.tf" ] && echo "$name $cmd with-local-backend" >> "$FAKE_LOG"
case "$cmd" in
  init)
    if [ "${FAKE_INIT_FAIL:-}" = "$name" ]; then echo "Error: init failed"; exit 1; fi
    echo "Terraform has been successfully initialized!"
    ;;
  plan)
    cat "$FAKE_PLANS/$name.txt"
    code=$(cat "$FAKE_PLANS/$name.code")
    # Like the real thing, a plan with changes ends with a separator and a note that depends on
    # whether the plan is saved: this is what made the first digest differ between the plan shown
    # (no -out) and the plan to apply (-out).
    if [ "$code" = 2 ]; then
      echo
      echo "─────────────────────────────────────────────────────────────"
      echo
      case "$*" in
        *-out=*)
          out=$(grep -o -e '-out=[^ ]*' <<< "$*" | cut -d= -f2)
          echo "Saved the plan to: $out"
          echo
          echo "To perform exactly these actions, run the following command to apply:"
          echo "    terraform apply \"$out\""
          ;;
        *)
          echo "Note: You didn't use the -out option to save this plan, so Terraform can't"
          echo "guarantee to take exactly these actions if you run \"terraform apply\" now."
          ;;
      esac
    fi
    exit "$code"
    ;;
esac
EOF
# Fake gcloud: only `storage objects describe`, driven by FAKE_STATE.
cat > "$work/bin/gcloud" << 'EOF'
#!/usr/bin/env bash
case "${FAKE_STATE:-exists}" in
  exists) echo "name: default.tfstate" ;;
  missing) echo "ERROR: (gcloud.storage.objects.describe) HTTPError 404: No URLs matched"; exit 1 ;;
  denied) echo "ERROR: HTTPError 403: caller does not have storage.objects.get"; exit 1 ;;
esac
EOF
chmod +x "$work/bin/terraform" "$work/bin/gcloud"

# plan_file NAME CODE REFRESH_LINE [ACTION_LINE]: a plan with a noisy head and the actions section.
plan_file() {
  local name="$1" code="$2" refresh="$3" action="${4:-}"
  {
    echo "Acquiring state lock. This may take a few moments..."
    echo "$refresh"
    if [ "$code" = 2 ]; then
      echo
      echo "Terraform will perform the following actions:"
      echo "  # $action will be created"
      echo "Plan: 1 to add, 0 to change, 0 to destroy."
    elif [ "$code" = 0 ]; then
      echo "No changes. Your infrastructure matches the configuration."
    else
      echo "Error: something went wrong"
    fi
  } > "$work/plans/$name.txt"
  echo "$code" > "$work/plans/$name.code"
}

# run_plan ARGS... : runs the script in the fake project; sets $code, $output, $outputs, $log.
run_plan() {
  : > "$work/log"; : > "$work/outputs"; : > "$work/summary"
  output=$(cd "$work/project" && env PATH="$work/bin:$PATH" FAKE_LOG="$work/log" FAKE_PLANS="$work/plans" \
    RUNNER_TEMP="$work" GITHUB_OUTPUT="$work/outputs" GITHUB_STEP_SUMMARY="$work/summary" \
    "$script" "$@" 2>&1)
  code=$?
  outputs=$(cat "$work/outputs")
  log=$(cat "$work/log")
}

check() {
  local label="$1" condition="$2"
  if eval "$condition"; then
    echo "pass: $label"
  else
    echo "FAIL: $label (exit $code)"
    echo "      output: $output"
    echo "      outputs: $outputs"
    echo "      log: $log"
    failures=$((failures + 1))
  fi
}

output_of() { grep "^$1=" <<< "$outputs" | cut -d= -f2-; }

# --- results ---

plan_file staging 0 "Refreshing state... [id=a]"
FAKE_STATE=exists run_plan --read-only envs/staging
check "no changes: exit 0 and nothing pending" '[ "$code" -eq 0 ] && [ -z "$(output_of pending)" ] && [ -z "$(output_of digest)" ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=exists run_plan --read-only envs/staging
check "changes: the root is pending and has a digest" '[ "$code" -eq 0 ] && [ "$(output_of pending)" = "envs/staging" ] && [ -n "$(output_of digest)" ]'

plan_file staging 1 "Refreshing state... [id=a]"
FAKE_STATE=exists run_plan --read-only envs/staging
check "a failed plan fails the job" '[ "$code" -eq 1 ]'

FAKE_INIT_FAIL=staging FAKE_STATE=exists run_plan --read-only envs/staging
check "a failed init fails the job" '[ "$code" -eq 1 ]'
unset FAKE_INIT_FAIL

# --- preview ---

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=missing run_plan --read-only envs/staging
check "missing state: planned against a local empty state" 'grep -q "staging plan with-local-backend" <<< "$log" && grep -q "staging init -reconfigure" <<< "$log"'
check "missing state: the preview is labelled and its changes are pending" 'grep -q "preview: no remote state yet" "$work/summary" && [ "$(output_of pending)" = "envs/staging" ]'
check "the override file is removed afterwards" '[ ! -e "$work/project/infra/envs/staging/backend_override.tf" ]'

plan_file staging 1 "Refreshing state... [id=a]"
FAKE_STATE=missing run_plan --read-only envs/staging
check "a failing preview is a warning, not a failure" '[ "$code" -eq 0 ] && grep -q "::warning::" <<< "$output" && [ -z "$(output_of pending)" ]'
check "the override file is removed after a failed preview" '[ ! -e "$work/project/infra/envs/staging/backend_override.tf" ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=denied run_plan --read-only envs/staging
check "another error reading the state is not a preview" '! grep -q "with-local-backend" <<< "$log"'

FAKE_STATE=exists run_plan --read-only envs/staging
check "an existing state is planned with the real backend" '! grep -q "with-local-backend" <<< "$log"'

# --- locks and saved plans ---

FAKE_STATE=exists run_plan --read-only envs/staging
check "read-only plans do not take the lock" 'grep -q "plan .*-lock=false" <<< "$log"'

FAKE_STATE=exists run_plan --save-dir "$work/saved" envs/staging
check "applying plans take the lock and save the plan" '! grep -q "lock=false" <<< "$log" && grep -q "plan .*-out=$work/saved/staging.tfplan" <<< "$log"'

# --- digest ---

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=exists run_plan --read-only envs/staging
first=$(output_of digest)
plan_file staging 2 "Refreshing state... [id=ZZZ] (another run, other noise)" "google_x.one"
FAKE_STATE=exists run_plan --read-only envs/staging
check "the digest ignores the refresh noise" '[ "$(output_of digest)" = "$first" ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=exists run_plan --save-dir "$work/saved" envs/staging
check "the digest is the same for the plan shown (no -out) and the plan to apply (-out)" '[ "$(output_of digest)" = "$first" ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.two"
FAKE_STATE=exists run_plan --read-only envs/staging
check "the digest changes when the planned actions change" '[ "$(output_of digest)" != "$first" ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=exists run_plan --save-dir "$work/saved" --expect-digest "$first" envs/staging
check "the expected digest matches: ok" '[ "$code" -eq 0 ]'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.changed"
FAKE_STATE=exists run_plan --save-dir "$work/saved" --expect-digest "$first" envs/staging
check "a changed plan is refused with exit 3" '[ "$code" -eq 3 ] && grep -q "Nothing was applied" <<< "$output"'

plan_file staging 0 "Refreshing state... [id=a]"
FAKE_STATE=exists run_plan --save-dir "$work/saved" --expect-digest "$first" envs/staging
check "no changes when changes were expected is refused too" '[ "$code" -eq 3 ]'

# --- what differs when the plan changed ---

plan_file staging 2 "Refreshing state... [id=a]" "google_x.one"
FAKE_STATE=exists run_plan --read-only envs/staging
shown_digest=$(output_of digest)
shown_actions=$(awk '/^actions<</ { on = 1; next } /^plan_actions_/ { on = 0 } on' "$work/outputs")
check "the planned actions are passed on as an output, without the trailer" '[ -n "$shown_actions" ] && grep -q "google_x.one will be created" <<< "$shown_actions" && ! grep -q "Note: You" <<< "$shown_actions"'

plan_file staging 0 "Refreshing state... [id=a]"
FAKE_STATE=exists run_plan --read-only envs/staging
check "nothing pending: no actions output" '! grep -q "^actions<<" "$work/outputs"'

plan_file staging 2 "Refreshing state... [id=a]" "google_x.changed"
SHOWN_ACTIONS="$shown_actions" FAKE_STATE=exists run_plan --save-dir "$work/saved" --expect-digest "$shown_digest" envs/staging
check "a refused plan shows what differs in the summary" '[ "$code" -eq 3 ] && grep -q "What differs between the plan shown" "$work/summary" && grep -q -e "-  # google_x.one will be created" "$work/summary" && grep -q -e "+  # google_x.changed will be created" "$work/summary"'
check "and in an annotation readable without the logs" 'grep -q "::error title=plan-diff::" <<< "$output"'

FAKE_STATE=exists run_plan --save-dir "$work/saved" --expect-digest "$shown_digest" envs/staging
check "without the shown actions the refusal still works, without a diff" '[ "$code" -eq 3 ] && ! grep -q "What differs" "$work/summary"'

big=$(head -c 100100 /dev/zero | tr '\0' 'a')
plan_file staging 2 "Refreshing state... [id=a]" "$big"
FAKE_STATE=exists run_plan --read-only envs/staging
check "a very large plan only gets the digest" '[ -n "$(output_of digest)" ] && ! grep -q "^actions<<" "$work/outputs"'

# --- several roots ---

plan_file platform 2 "Refreshing state... [id=a]" "google_p.one"
plan_file production 0 "Refreshing state... [id=a]"
plan_file staging 0 "Refreshing state... [id=a]"
FAKE_STATE=exists run_plan --read-only platform envs/production
check "only the roots with changes are pending, in order" '[ "$(output_of pending)" = "platform" ] && [ "$code" -eq 0 ]'

plan_file production 2 "Refreshing state... [id=a]" "google_p.two"
FAKE_STATE=exists run_plan --read-only platform envs/production
check "the state prefix and file names use the last path segment" '[ "$(output_of pending)" = "platform envs/production" ] && grep -q "production init" <<< "$log"'

# --- usage ---

run_plan --read-only
check "no root is a usage error" '[ "$code" -eq 2 ]'
run_plan --bogus envs/staging
check "an unknown option is a usage error" '[ "$code" -eq 2 ]'

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed"
  exit 1
fi
echo "all tests passed"
