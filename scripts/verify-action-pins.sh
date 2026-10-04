#!/usr/bin/env bash
# Verify every `uses: owner/repo[/path]@<40-hex>` pin in .github/workflows
# actually resolves to a real commit in that repository.
#
# WHY THIS EXISTS: the Production Health Monitor's first-ever run (Oct 3 2026,
# run #1) failed after 2 seconds with
#
#   Unable to resolve action `actions/cache@5a3ec84eff668545956fd18022155c47e93a26806`,
#   unable to find version `5a3ec84eff668545956fd18022155c47e93a26806`
#
# The SHA was 40 hex characters — it passed every eyeball check and every
# format check — but no such commit has ever existed. Pinning by SHA stops
# supply-chain tampering, but a wrong SHA stops the job dead, before a single
# line of the workflow runs. Nothing in CI noticed, because CI never referenced
# actions/cache; only the new monitor did.
#
# tests/prod-health-monitor.test.ts (G9) checks the offline half of this: that
# every pin is a full 40-hex SHA rather than a floating tag. THIS script checks
# the half that needs the network: that the SHA is real. Run it before pushing
# any change to a workflow file.
#
# Usage:  bash scripts/verify-action-pins.sh
# Needs:  curl, grep. Network access.
# Exit:   0 every pin resolves
#         1 at least one pin is malformed or does not exist
#         3 inconclusive — GitHub throttled us, so no verdict was reached
#
# Set GITHUB_TOKEN in the environment to raise the API rate limit; without it
# this shares an unauthenticated ~60 req/hour budget with everything else on
# the machine and will start returning 403 mid-run.
#
# Note on subdirectory actions: `actions/cache/restore` is a subdirectory of
# the actions/cache REPO, not its own repo, so the repo to query is the first
# two path segments. Querying actions/cache/restore returns 404 for a perfectly
# valid pin — that mistake produced a false alarm here, so do not "fix" it by
# trusting the first result you get.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

workflow_dir=".github/workflows"
if [ ! -d "$workflow_dir" ]; then
  echo "no $workflow_dir — nothing to verify" >&2
  exit 2
fi

# Collect `uses:` refs, dedupe. Grep -h so filenames stay out of the value.
#
# The `[^[:space:]]` tail plus the length check below is load-bearing. The bad
# pin that started all this was 41 hex characters, not 40 — an unanchored
# `[0-9a-f]{40}` pattern matched its first 40 characters and reported a
# perfectly plausible SHA, which is a worse failure than the original because
# it looks like it passed. Trailing junk must be caught, not truncated.
refs=$(grep -rhoE 'uses: [^[:space:]]+' "$workflow_dir" \
  | sed 's/^uses: //' | sort -u)

if [ -z "$refs" ]; then
  echo "FAIL: no pinned actions found in $workflow_dir — did the grep pattern break?"
  exit 1
fi

failed=0
unknown=0
count=0

# Does this repo have a ref pointing at exactly this SHA? Uses the git protocol
# (no REST quota). Cached per repo because it costs a network round trip.
declare -A LS_CACHE=()
remote_has_sha() {
  local repo="$1" sha="$2" out
  if [ -z "${LS_CACHE[$repo]:-}" ]; then
    out=$(git ls-remote "https://github.com/$repo" 2>/dev/null) || out=""
    LS_CACHE[$repo]="$out"
  else
    out="${LS_CACHE[$repo]}"
  fi
  [ -n "$out" ] || return 1
  printf '%s\n' "$out" | grep -q "^$sha[[:space:]]"
}

while read -r ref; do
  [ -z "$ref" ] && continue
  count=$((count + 1))
  path="${ref%@*}"
  sha="${ref##*@}"
  repo="$(printf '%s' "$path" | cut -d/ -f1-2)"

  # Validate the shape before spending an API call on it, and so a 41-char or
  # `owner/repo@sha # comment` ref reports as malformed instead of as a 404.
  if [ "${#sha}" -ne 40 ]; then
    echo "FAIL   $ref — pin must be exactly 40 hex chars, this is ${#sha}"
    failed=$((failed + 1))
    continue
  fi
  case "$sha" in
    *[!0-9a-f]*)
      echo "FAIL   $ref — pin contains non-hex characters"
      failed=$((failed + 1))
      continue
      ;;
  esac

  code=$(curl -sS -o /dev/null -w '%{http_code}' \
    "https://api.github.com/repos/$repo/commits/$sha" 2>/dev/null)
  curl_rc=$?
  if [ "$curl_rc" -ne 0 ]; then
    echo "ERROR  $ref — could not reach api.github.com (curl exit $curl_rc)"
    unknown=$((unknown + 1))
    continue
  fi

  case "$code" in
    200)
      echo "ok     $ref"
      ;;
    403|429)
      # Unauthenticated api.github.com allows ~60 requests/hour per IP. Being
      # throttled is NOT evidence the pin is bad — treating it as a failure
      # makes the script blame the repo for our own throttling, which is how a
      # correct script starts getting ignored.
      #
      # Fall back to `git ls-remote`, which is served by the git endpoints and
      # is NOT subject to the REST rate limit. It lists refs, so a SHA that
      # appears there is definitely a real commit; a SHA that does NOT appear
      # is only "not a ref tip", which is not proof of anything wrong — hence
      # inconclusive rather than failure.
      if remote_has_sha "$repo" "$sha"; then
        echo "ok     $ref  (via ls-remote; REST was throttled)"
      else
        echo "RATE   $ref — HTTP $code and not a ref tip; INCONCLUSIVE, not a verdict"
        unknown=$((unknown + 1))
      fi
      ;;
    *)
      echo "FAIL   $ref — repo $repo has no commit $sha (HTTP $code)"
      failed=$((failed + 1))
      ;;
  esac
done <<EOF
$refs
EOF

echo "----"
if [ "$failed" -gt 0 ]; then
  echo "$failed of $count pinned action(s) DO NOT RESOLVE — a job using them cannot start"
  exit 1
fi
if [ "$unknown" -gt 0 ]; then
  # Do not exit 0: an inconclusive run is not a passing run, and silently
  # reporting "all resolve" after being throttled would be a lie.
  echo "$unknown of $count pin(s) INCONCLUSIVE (API throttled) — rerun, or set GITHUB_TOKEN"
  exit 3
fi
echo "all $count pinned action(s) resolve"
exit 0