#!/usr/bin/env bash
# ─── Nong-Kati — ci-postswitch-gate.sh ──────────────────────────────────────
# Run the Phase 7 certification from CI (or by hand) after a deploy artifact has
# been published. It is the runner-side half of `.github/workflows/postswitch-gate.yml`,
# kept in a script so it can be exercised locally instead of only inside Actions.
#
# Publishing an artifact (scripts/deploy-artifact.sh) pushes an orphan commit to
# the `deploy-artifact` branch whose subject is:
#
#     deploy bundle <BUILD_ID> (git <SHA>)
#
# That push is the only trustworthy "a release was sent" signal CI has — the
# switch itself happens on Plesk. So this script:
#
#   1. reads the expected BUILD_ID out of that commit subject,
#   2. waits until the live site actually serves it (the switch, not the push),
#   3. opens an SSH tunnel when the database is local-only (it always is here —
#      Phase 5 creates the user with "Allow remote access" unchecked),
#   4. runs scripts/postswitch-check.mjs against the live URL and propagates its
#      exit status, so a release that is live-but-not-certified fails the job.
#
# Usage
#   bash scripts/ci-postswitch-gate.sh                 # full gate
#   bash scripts/ci-postswitch-gate.sh --check-only    # steps 1–2 only (no database)
#   bash scripts/ci-postswitch-gate.sh --dry-run       # print the plan, run nothing
#   --base=<url>        site under test           (default $POSTSWITCH_BASE_URL or the prod URL)
#   --build-id=<id>     expected BUILD_ID         (default: parsed from the deploy commit)
#   --timeout=<s>       how long to wait for it   (default 1800)
#
# Env
#   POSTSWITCH_TARGET_DATABASE_URL  mysql:// URL as the SERVER sees it (localhost:3306/<db>).
#                                   Required for the full gate; omit only for --check-only.
#   PLESK_SSH_KEY / PLESK_SSH_HOST / PLESK_SSH_USER
#                                   ssh key path, host and user for the tunnel. Without them the
#                                   URL is used as-is, which only works if the DB is reachable
#                                   from the runner (it is not, with local-only access).
#   GATE_MAX_UPTIME                 seconds the process may have been up (default: derived from
#                                   the deploy commit's age + 300s slack)
#
# Exit: 0 certified · 1 live but not certified / never switched · 2 cannot certify (missing input)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;36m▶ %b\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %b\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %b\033[0m\n' "$*" >&2; exit 2; }

BASE="${POSTSWITCH_BASE_URL:-https://nongkatistore.com}"
EXPECTED="${EXPECTED_BUILD_ID:-}"
TIMEOUT="${GATE_TIMEOUT:-1800}"
CHECK_ONLY=0
DRY_RUN=0
TUNNEL_PID=""

cleanup() {
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    --base=*)     BASE="${arg#--base=}" ;;
    --build-id=*) EXPECTED="${arg#--build-id=}" ;;
    --timeout=*)  TIMEOUT="${arg#--timeout=}" ;;
    -h|--help)    awk 'NR>2 && /^# ─/{exit} NR>2{sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)            die "unknown argument: $arg (try --help)" ;;
  esac
done

BASE="${BASE%/}"
[ -n "$BASE" ] || die "--base is empty."
command -v node >/dev/null 2>&1 || die "node is not on PATH."
mkdir -p reports

# ── 1. Which release is this the gate for? ─────────────────────────────────
# The artifact commit is the only CI-visible record of what was shipped. It lives
# on the artifact branch, NOT on the checked-out tree (that branch is an orphan
# holding one tarball), so read it from the ref, never from HEAD. A manual run may
# pass --build-id instead (e.g. to re-certify the running build).
DEPLOY_REF="${DEPLOY_REF:-origin/deploy-artifact}"
if [ -z "$EXPECTED" ]; then
  EXPECTED="$(git log -1 --format=%s "$DEPLOY_REF" 2>/dev/null \
    | sed -nE 's/^deploy bundle ([^ ]+) \(git [0-9a-f]+\)$/\1/p' || true)"
  [ -n "$EXPECTED" ] || EXPECTED="$(git log -1 --format=%s 2>/dev/null \
    | sed -nE 's/^deploy bundle ([^ ]+) \(git [0-9a-f]+\)$/\1/p' || true)"
fi
[ -n "$EXPECTED" ] || die "cannot determine which BUILD_ID to certify:
  $DEPLOY_REF has no 'deploy bundle <BUILD_ID> (git <sha>)' commit, and no --build-id was given.
  Check that the artifact push reached the remote the runner fetches ($DEPLOY_REF), or pass
  --build-id=<id> / set EXPECTED_BUILD_ID to certify a build explicitly."

DEPLOYED_AT="$(git log -1 --format=%ct "$DEPLOY_REF" 2>/dev/null || git log -1 --format=%ct 2>/dev/null || echo 0)"
[ "$DEPLOYED_AT" -gt 0 ] 2>/dev/null || DEPLOYED_AT=0

say "Post-switch gate — build $EXPECTED"
printf '  base      : %s\n' "$BASE"
printf '  check-only: %s\n' "$([ "$CHECK_ONLY" = "1" ] && echo yes || echo no)"

if [ "$DRY_RUN" = "1" ]; then
  printf '  target    : %s\n' "$(printf '%s' "${POSTSWITCH_TARGET_DATABASE_URL:-}" | sed -E 's#//[^@]*@#//***@#')"
  printf '  tunnel    : %s\n' "$([ -n "${PLESK_SSH_KEY:-}" ] && echo "ssh -N -L 3306:127.0.0.1:3306 ${PLESK_SSH_USER:-nongka}@${PLESK_SSH_HOST:-<host>}" || echo 'none (DB URL used as given)')"
  printf '\n  1. node scripts/wait-for-build.mjs --build-id=%s --base=%s --timeout=%s\n' "$EXPECTED" "$BASE" "$TIMEOUT"
  if [ "$CHECK_ONLY" = "0" ]; then
    printf '  2. TARGET_DATABASE_URL=… node scripts/postswitch-check.mjs --base=%s --max-uptime=<n>\n' "$BASE"
  else
    printf '  2. (skipped: --check-only)\n'
  fi
  exit 0
fi

# ── 2. Wait for the switch, not the push ───────────────────────────────────
say "Waiting for $EXPECTED to serve at $BASE"
if ! node scripts/wait-for-build.mjs --build-id="$EXPECTED" --base="$BASE" --timeout="$TIMEOUT"; then
  # Exit 1, not 2: the artifact was published, the switch never landed. That is a
  # release failure — it just is not a certification failure.
  printf '\n\033[1;31m✖ the artifact is published but the site never served it — nothing to certify.\033[0m\n' >&2
  printf '  artifact : %s (BUILD_ID %s)\n' "$DEPLOY_REF" "$EXPECTED" >&2
  printf '  site     : %s\n' "$BASE" >&2
  exit 1
fi

if [ "$CHECK_ONLY" = "1" ]; then
  say "check-only: the release is live. The database half of the gate was not run."
  exit 0
fi

# ── 3. The database the gate must read ─────────────────────────────────────
TARGET="${POSTSWITCH_TARGET_DATABASE_URL:-}"
[ -n "$TARGET" ] || die "POSTSWITCH_TARGET_DATABASE_URL is not set, so the gate cannot certify.
  Phase 5 creates the database and user (local connections only), so CI reaches it through an SSH
  tunnel: set the secret to mysql://<user>:<pass>@localhost:3306/<db> (the URL *as the server sees
  it*) together with PLESK_SSH_KEY / PLESK_SSH_HOST, or leave it unset and run
  scripts/deploy-full.sh locally, which certifies from a machine that already has the tunnel."
case "$TARGET" in
  mysql://*|mysqls://*) : ;;
  *) die "POSTSWITCH_TARGET_DATABASE_URL must be a mysql:// URL — got ${TARGET%%://*}://… ." ;;
esac

MAX_UPTIME="${GATE_MAX_UPTIME:-}"
if [ -z "$MAX_UPTIME" ]; then
  # The release landed when the artifact was pushed; the process must be younger
  # than that plus a few minutes. A stale process fails here, which is the point.
  if [ "$DEPLOYED_AT" -gt 0 ]; then
    MAX_UPTIME=$(( $(date +%s) - DEPLOYED_AT + 300 ))
  else
    MAX_UPTIME=1800
  fi
fi

GATE_TARGET="$TARGET"
if [ -n "${PLESK_SSH_KEY:-}" ]; then
  [ -n "${PLESK_SSH_HOST:-}" ] || die "PLESK_SSH_KEY is set but PLESK_SSH_HOST is not."
  SSH_USER="${PLESK_SSH_USER:-nongka}"
  say "Opening the tunnel to the local-only database ($SSH_USER@$PLESK_SSH_HOST)"
  # The key comes from a CI secret written to a file with 0600. BatchMode keeps a
  # missing/mistrusted key from turning into a hung prompt inside CI.
  ssh -i "$PLESK_SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
      -N -L 3306:127.0.0.1:3306 "$SSH_USER@$PLESK_SSH_HOST" &
  TUNNEL_PID=$!
  for _ in $(seq 1 20); do
    if node -e "const net=require('net');const s=net.connect(3306,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1500,()=>{s.destroy();process.exit(1)})" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    die "the SSH tunnel died — check PLESK_SSH_KEY/PLESK_SSH_HOST (the key must be in the account's authorized_keys)."
  fi
  # Rewrite only the host the gate dials; the credentials and database name stay.
  GATE_TARGET="$(printf '%s' "$TARGET" | sed -E 's#^(mysqls?://[^@]*@)(localhost|127\.0\.0\.1)(:[0-9]+)?/#\1127.0.0.1:3306/#')"
fi

# ── 4. Certify ─────────────────────────────────────────────────────────────
LOG="reports/postswitch-gate-$(date '+%Y%m%d-%H%M%S').log"
say "Running the post-switch gate (max uptime ${MAX_UPTIME}s)"
printf '  target : %s\n' "$(printf '%s' "$GATE_TARGET" | sed -E 's#//[^@]*@#//***@#')"
printf '  log    : %s\n' "$LOG"

set +e
TARGET_DATABASE_URL="$GATE_TARGET" node scripts/postswitch-check.mjs \
  --base="$BASE" --max-uptime="$MAX_UPTIME" 2>&1 | tee "$LOG"
STATUS="${PIPESTATUS[0]}"
set -e

if [ "$STATUS" != "0" ]; then
  printf '\n\033[1;31m✖ release %s is LIVE at %s but NOT CERTIFIED (exit %s).\033[0m\n' "$EXPECTED" "$BASE" "$STATUS"
  printf '  evidence: %s\n' "$LOG"
  printf '  nothing was rolled back — the site keeps serving what it has.\n'
  exit 1
fi

printf '\n\033[1;32m✔ release %s certified at %s.\033[0m\n' "$EXPECTED" "$BASE"
printf '  evidence: %s\n' "$LOG"
