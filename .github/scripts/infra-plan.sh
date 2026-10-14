#!/usr/bin/env bash
# Terraform plan of one or more roots, shared by every job of infra.yml that plans.
#
# Usage: infra-plan.sh [--read-only] [--label TEXT] [--save-dir DIR] [--expect-digest SHA] ROOT...
#   ROOT              directory relative to infra/ (platform, envs/staging, envs/production)
#   --read-only       plan with a read-only identity: `-lock=false`, and a root whose remote state
#                     does not exist yet is planned against an empty state ("preview") instead of
#                     being skipped; an error in a preview is a warning, never a failure
#   --label TEXT      suffix of the heading in the job summary
#   --save-dir DIR    write each plan to DIR/<name>.tfplan, so that exactly that plan is applied
#   --expect-digest   fail (exit 3) before anything is applied if the planned actions differ from
#                     the ones the owner saw in the plan job (see "digest" below)
#
# Outputs (to $GITHUB_OUTPUT when set):
#   pending   roots that have changes
#   digest    SHA-256 of the planned actions of those roots. It covers only the section of the
#             plan that lists what will change, not the refresh noise, so two plans of the same
#             state give the same digest.
#
# Exit codes: 0 done, 1 a plan failed, 2 bad usage, 3 the digest does not match.
#
# Plans are published in the job summary. They hold no secrets: sensitive values are masked and
# a plan file is never uploaded as an artifact (it keeps them in clear).

set -uo pipefail

read_only=false
label=""
save_dir=""
expect_digest=""
roots=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --read-only) read_only=true ;;
    --label) label="${2:-}"; shift ;;
    --save-dir) save_dir="${2:-}"; shift ;;
    --expect-digest) expect_digest="${2:-}"; shift ;;
    --*) echo "error: unknown option $1" >&2; exit 2 ;;
    *) roots+=("$1") ;;
  esac
  shift
done
if [ "${#roots[@]}" -eq 0 ]; then
  echo "error: at least one root is required" >&2
  exit 2
fi

tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
state_bucket="${STATE_BUCKET:-pdlco-mytasks-tfstate}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
[ -n "$save_dir" ] && mkdir -p "$save_dir"

status=0
pending=""
digest_input=""

# The part of the plan that lists what will change. Everything before it (refresh lines, lock
# messages, drift notes) varies between runs of the same plan.
actions_of() {
  sed -n '/^Terraform will perform the following actions/,$p' "$1"
}

for root in "${roots[@]}"; do
  name=$(basename "$root")
  dir="infra/$root"
  out="$tmp/plan-$name.txt"
  : > "$out"

  mode="plan"
  if $read_only; then
    # Against a missing state the GCS backend tries to create it (and its lock), which the
    # read-only identity cannot do. Until a first apply creates it, plan against an empty state.
    if ! state_check=$(gcloud storage objects describe "gs://$state_bucket/$name/default.tfstate" 2>&1) \
      && grep -q '404' <<< "$state_check"; then
      mode="preview"
    fi
  fi

  plan_args=(-input=false -no-color -detailed-exitcode)
  $read_only && plan_args+=(-lock=false)
  [ -n "$save_dir" ] && plan_args+=("-out=$save_dir/$name.tfplan")

  if [ "$mode" = "preview" ]; then
    # An override file replaces the remote backend by a local one for this plan only.
    cat > "$dir/backend_override.tf" << EOF
terraform {
  backend "local" {
    path = "$tmp/preview-$name.tfstate"
  }
}
EOF
    init_args=(-reconfigure -input=false -no-color)
  else
    init_args=(-input=false -no-color)
  fi

  if terraform -chdir="$dir" init "${init_args[@]}" >> "$out" 2>&1; then
    terraform -chdir="$dir" plan "${plan_args[@]}" >> "$out" 2>&1
    code=$?
  else
    code=1
  fi
  [ "$mode" = "preview" ] && rm -f "$dir/backend_override.tf"

  heading="plan: $name"
  [ -n "$label" ] && heading="$heading ($label)"
  [ "$mode" = "preview" ] && heading="$heading, preview: no remote state yet, planned against an empty state"

  case "$code" in
    0) result="no changes" ;;
    2)
      result="changes"
      pending="$pending $root"
      digest_input+="== $name"$'\n'"$(actions_of "$out")"$'\n'
      ;;
    *)
      if [ "$mode" = "preview" ]; then
        result="preview unavailable"
        echo "::warning::Preview of $name failed (the real plan runs at apply time). The end of the output is in the job summary."
      else
        result="failed"
        status=1
      fi
      ;;
  esac

  {
    echo "### $heading: $result"
    echo '```'
    head -c 60000 "$out"
    echo
    echo '```'
  } >> "$summary"
done

pending="${pending# }"
digest=""
if [ -n "$pending" ]; then
  digest=$(printf '%s' "$digest_input" | sha256sum | cut -d' ' -f1)
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "pending=$pending"
    echo "digest=$digest"
  } >> "$GITHUB_OUTPUT"
fi

if [ "$status" -ne 0 ]; then exit "$status"; fi

if [ -n "$expect_digest" ] && [ "$digest" != "$expect_digest" ]; then
  echo "::error::The plan changed since the one that was shown for approval (expected digest ${expect_digest:0:12}, got ${digest:0:12}). Nothing was applied. Read the new plan in the summary and run the workflow again."
  exit 3
fi
exit 0
