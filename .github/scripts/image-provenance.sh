#!/usr/bin/env bash
# Provenance of the images of deploy.yml (security-review-fase-4, MED-001).
#
# Usage:
#   image-provenance.sh stamp  COMPONENT TREE_HASH SOURCE_REF TARGET_REF
#   image-provenance.sh verify COMPONENT TREE_HASH IMAGE_REF
#
#   COMPONENT   api or web
#   TREE_HASH   Git tree hash of the component folder (40 hex characters)
#
# stamp   builds TARGET_REF on top of SOURCE_REF adding the provenance labels, and pushes it.
#         This is how `pack build` output gets labels (pack has no `--label`), and the web image
#         goes through the same step so both components are treated alike. Needs COMMIT (full
#         SHA of the commit) and RUN_ID (id of the pipeline run) in the environment.
# verify  reads the labels of IMAGE_REF (use a digest reference: what is checked is then exactly
#         what is deployed) and fails unless they say it was built by this pipeline for this
#         component and this tree hash.
#
# Labels: io.mytasks.component, io.mytasks.tree-hash, io.mytasks.built-by, io.mytasks.pipeline-run
# and org.opencontainers.image.revision.
#
# What this does and does not give: it stops a wrong image being deployed or validated by mistake
# (a tag created by hand, a build of other content, an image from before the labels). It does not
# stop someone who can already push to the registry, because that identity can write any label.
# Signed attestations (SLSA provenance verified at deploy time) would; they are in the backlog.
#
# Exit codes: 0 done, 1 the check or the build failed, 2 bad usage.

set -uo pipefail

BUILT_BY="deploy.yml"

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

check_args() {
  local component="$1" hash="$2"
  case "$component" in
    api | web) ;;
    *) echo "::error::Unknown component '$component' (api or web)" >&2; exit 2 ;;
  esac
  if ! [[ "$hash" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::'$hash' is not a Git tree hash" >&2
    exit 2
  fi
}

stamp() {
  [ "$#" -eq 4 ] || usage
  local component="$1" hash="$2" source="$3" target="$4"
  check_args "$component" "$hash"
  if ! [[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::COMMIT must be the full SHA of the commit" >&2
    exit 2
  fi
  if ! [[ "${RUN_ID:-}" =~ ^[0-9]+$ ]]; then
    echo "::error::RUN_ID must be the numeric id of the pipeline run" >&2
    exit 2
  fi

  # The Dockerfile comes through stdin and there is no build context: the new image only adds
  # labels, it never copies anything. Provenance and SBOM attestations are off so the result is a
  # single image, not an index that `verify` would have to unpack.
  if ! printf 'FROM %s\n' "$source" | docker build --tag "$target" \
    --provenance=false --sbom=false \
    --label "io.mytasks.component=$component" \
    --label "io.mytasks.tree-hash=$hash" \
    --label "io.mytasks.built-by=$BUILT_BY" \
    --label "io.mytasks.pipeline-run=$RUN_ID" \
    --label "org.opencontainers.image.revision=$COMMIT" \
    -; then
    echo "::error::Could not add the provenance labels to $source" >&2
    exit 1
  fi
  docker push "$target" || exit 1
}

verify() {
  [ "$#" -eq 3 ] || usage
  local component="$1" hash="$2" ref="$3" config labels
  check_args "$component" "$hash"

  if ! config=$(docker buildx imagetools inspect "$ref" --format '{{json .Image}}' 2>&1); then
    echo "::error::Cannot read the image $ref to check its provenance: $config" >&2
    exit 1
  fi
  # Labels live in `config.Labels` of the image configuration. A single-platform image is the
  # configuration itself; for an index, take the linux/amd64 one (Cloud Run runs that).
  if ! labels=$(jq -c '
      (if (.config? // .Config?) then . else (.["linux/amd64"] // {}) end)
      | (.config // .Config // {}).Labels // {}' <<< "$config" 2>&1); then
    echo "::error::Cannot parse the configuration of $ref: $labels" >&2
    exit 1
  fi

  local failed=0 key expected actual
  for pair in \
    "io.mytasks.component=$component" \
    "io.mytasks.tree-hash=$hash" \
    "io.mytasks.built-by=$BUILT_BY"; do
    key="${pair%%=*}"
    expected="${pair#*=}"
    actual=$(jq -r --arg k "$key" '.[$k] // empty' <<< "$labels")
    if [ "$actual" != "$expected" ]; then
      echo "::error::Image $ref: label $key is '${actual:-<missing>}', expected '$expected'. It was not built by this pipeline from this content." >&2
      failed=1
    fi
  done
  # Informative, but it must be there and well formed: it names the commit that built the image.
  actual=$(jq -r '.["org.opencontainers.image.revision"] // empty' <<< "$labels")
  if ! [[ "$actual" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::Image $ref: label org.opencontainers.image.revision is '${actual:-<missing>}', expected a commit SHA." >&2
    failed=1
  fi

  if [ "$failed" -ne 0 ]; then
    echo "::error::Provenance check failed for mytasks-$component ($hash). Tags are immutable, so change the content of the component (any commit under its folder gives a new hash) and let the pipeline build it again." >&2
    exit 1
  fi
  echo "mytasks-$component $hash: provenance ok (commit $actual)"
}

case "${1:-}" in
  stamp) shift; stamp "$@" ;;
  verify) shift; verify "$@" ;;
  *) usage ;;
esac
