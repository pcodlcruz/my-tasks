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

# The part of the plan that lists what will change. Neither what comes before it (refresh lines,
# lock messages, drift notes) nor what comes after it is stable between runs of the same plan:
# after the actions Terraform prints a separator line and then a note that depends on whether
# the plan is saved ("You didn't use the -out option" or "Saved the plan to"), so the plan shown
# (not saved) and the plan to apply (saved) would never have the same digest. The extract stops
# at the first separator line and drops the blank lines before it.
#
# Inside the actions there is one more unstable value: the `check_time` of the DNS checks that
# Firebase Hosting reports in `required_dns_updates`, which is the moment of each plan. It is not an
# action, so those lines are left out, or no plan could ever be applied as shown.
actions_of() {
  awk '
    /^Terraform will perform the following actions/ { on = 1 }
    on && index($0, "─") == 1 { exit }
    on && $0 ~ /^[[:space:]]*[-+~][[:space:]]+check_time[[:space:]]+=/ { next }
    on {
      if ($0 ~ /^[[:space:]]*$/) { blank++ }
      else { while (blank > 0) { print ""; blank-- } print }
    }
  ' "$1"
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
        # The end of the output is also an annotation of the check: the summary is easy to miss
        # and the raw log only has the exit code. A plan holds no secrets (research R8).
        echo "::error::Plan of $name failed. End of the output:%0A$(tail -n 15 "$out" | awk 'BEGIN { ORS = "%0A" } { print }')"
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

# The planned actions are also passed on, so that the apply job can show what differs if its plan
# is not the one that was shown. Plans are public in the job summary anyway. A job output is
# limited, and it reaches the apply job as one environment variable (128 KB at most), so a very
# large plan only gets the digest. The limit is in bytes, not characters.
actions_limit=100000
actions_bytes=$(printf '%s' "$digest_input" | wc -c | tr -d ' ')
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "pending=$pending"
    echo "digest=$digest"
    if [ -n "$pending" ] && [ "$actions_bytes" -le "$actions_limit" ]; then
      delimiter="plan_actions_$(date +%s%N)"
      echo "actions<<$delimiter"
      printf '%s\n' "$digest_input"
      echo "$delimiter"
    fi
  } >> "$GITHUB_OUTPUT"
fi

if [ "$status" -ne 0 ]; then exit "$status"; fi

if [ -n "$expect_digest" ] && [ "$digest" != "$expect_digest" ]; then
  message="The plan changed since the one that was shown for approval (expected digest ${expect_digest:0:12}, got ${digest:0:12}). Nothing was applied. Read the new plan in the summary and run the workflow again."
  echo "::error::$message"
  if [ -n "${SHOWN_ACTIONS:-}" ]; then
    printf '%s\n' "$SHOWN_ACTIONS" > "$tmp/shown-actions.txt"
    printf '%s\n' "$digest_input" > "$tmp/applied-actions.txt"
    difference=$(diff -u "$tmp/shown-actions.txt" "$tmp/applied-actions.txt" | head -n 80 || true)
    {
      echo "### What differs between the plan shown and the plan to apply"
      echo '```diff'
      echo "$difference"
      echo '```'
    } >> "$summary"
    # The first lines also go to an annotation, which is readable without opening the logs.
    annotation=$(head -n 25 <<< "$difference" | sed ':a;N;$!ba;s/\n/%0A/g')
    echo "::error title=plan-diff::$annotation"
  fi
  exit 3
fi
exit 0
