#!/usr/bin/env bash
# ─── Nong-Kati — lib/certify.sh ──────────────────────────────────────────────
# One implementation of "the release is only done when it is certified".
#
# Both deploy paths source this file and call certify_release after their switch:
#   scripts/deploy-full.sh      — scripted loop (bundle → push → Run-Now over SSH)
#   scripts/deploy-manual.sh    — panel path (bundle → Run-Now by hand → wait)
# so the gate, its banners and its exit codes cannot drift between them.
#
# certify_release <base-url> <max-uptime-seconds> [extra-context]
#   returns 0  the live release passed scripts/postswitch-check.mjs (22 checks)
#   returns 2  the gate could not run — TARGET_DATABASE_URL is missing, so nobody
#              certified anything. Refusing is the point: a silent pass here would
#              be a lie about a release.
#   returns 3  the gate ran and failed. The release is live and NOT certified.
#
# SKIP_POSTSWITCH=1 returns 0 and says UNVERIFIED out loud. It exists for the
# pre-cutover window, where the target database does not exist yet; it is not a
# routine convenience.

# Callers define say/warn; fall back so the lib is usable on its own.
declare -F say  >/dev/null 2>&1 || say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
declare -F warn >/dev/null 2>&1 || warn() { printf '\n\033[1;33m⚠ %s\033[0m\n' "$*"; }

# certify_precondition <base> — resolve the target database, or refuse (2).
# 0 = certifiable (or deliberately skipped), 2 = nothing could certify this release.
# Call it BEFORE publishing, so a deploy that cannot be certified never ships.
certify_precondition() {
  local base="$1"

  [ "${SKIP_POSTSWITCH:-0}" = "1" ] && return 0

  # The cutover file keeps the target URL out of the environment/history.
  if [ -z "${TARGET_DATABASE_URL:-}" ] && [ -f .env.cutover ]; then
    set -a; . ./.env.cutover; set +a
  fi
  [ -n "${TARGET_DATABASE_URL:-}" ] && return 0

  printf '\n\033[1;31m✖ POST-SWITCH CHECK COULD NOT RUN — TARGET_DATABASE_URL is not set.\033[0m\n' >&2
  printf '  Nothing would certify the running app against the database it is supposed to be\n' >&2
  printf '  reading, so this deploy is refused before it publishes anything.\n' >&2
  printf '  Set TARGET_DATABASE_URL (or put it in .env.cutover), then re-run.\n' >&2
  printf '  A pre-cutover deploy that genuinely cannot certify may pass SKIP_POSTSWITCH=1.\n' >&2
  printf '  Gate alone: SITE_URL=%s bash scripts/deploy-full.sh --postswitch-only\n' "$base" >&2
  return 2
}

certify_release() {
  local base="$1" max_uptime="${2:-1800}" context="${3:-}" rc=0

  if [ "${SKIP_POSTSWITCH:-0}" = "1" ]; then
    warn "POST-SWITCH CHECK SKIPPED (SKIP_POSTSWITCH=1) — this release is live but UNVERIFIED."
    return 0
  fi

  certify_precondition "$base" || rc=$?
  [ "$rc" = 0 ] || return "$rc"

  say "Certify: running the post-switch check against $base (max uptime ${max_uptime}s)…"
  if node scripts/postswitch-check.mjs --base="$base" --max-uptime="$max_uptime"; then
    printf '\n\033[1;32m✅ POST-SWITCH CHECK PASSED — the live release is certified against the target database.\033[0m\n'
    return 0
  fi

  printf '\n──────────────────────────────────────────────────────────────────────────────\n'
  printf ' ❌ DEPLOY IS LIVE BUT NOT CERTIFIED\n'
  printf '──────────────────────────────────────────────────────────────────────────────\n'
  [ -n "$context" ] && printf ' %s\n' "$context"
  printf ' live site      : %s\n' "$base"
  printf ' post-switch    : FAILED (the failing check is named above)\n'
  printf '\n The new build is serving; the shop has not been proven to work against the\n'
  printf ' database. Treat this release as broken until it passes:\n'
  printf '   SITE_URL=%s bash scripts/deploy-full.sh --postswitch-only\n' "$base"
  printf ' Rollback if it cannot be made green: re-publish the previous bundle.\n'
  printf '──────────────────────────────────────────────────────────────────────────────\n'
  return 3
}
