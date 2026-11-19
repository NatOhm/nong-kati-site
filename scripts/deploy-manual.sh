#!/usr/bin/env bash
# ─── Nong-Kati — deploy-manual.sh ────────────────────────────────────────────
# The panel deploy (docs/deploy-hostatom-manual.md Steps 0–5b) as ONE command.
#
#   1. publish   build (or reuse) the Linux-portable bundle and force-push it as
#                the `deploy-artifact` branch — scripts/deploy-artifact.sh
#   2. switch    you click Run Now in Plesk once; this script waits until the live
#                site answers with the BUILD_ID it just published
#   3. certify   scripts/postswitch-check.mjs runs automatically against the live
#                site and the target database
#
# There is no separate "now type the gate command" step: if the certification
# fails, this script prints the ❌ DEPLOY IS LIVE BUT NOT CERTIFIED box and exits
# 3, so the release is explicitly not done. If the switch never lands it exits 1.
#
# Usage
#   bash scripts/make-gate-env.sh      # hidden prompt → tmp/nk6/gate.env (0600)
#   bash scripts/deploy-manual.sh
#
#   SKIP_BUILD=1            reuse an existing fresh .next build
#   DRY_RUN=1               stage the bundle and stop (nothing published, nothing certified)
#   SKIP_POSTSWITCH=1       publish + switch, then say UNVERIFIED (pre-cutover only)
#   DEPLOY_WAIT_SECONDS=900 how long to wait for the panel switch to land (default 900)
#   SITE_URL                https://nongkatistore.com by default
#
# Exits: 0 certified · 1 switch never landed · 2 cannot certify (no target) · 3 live but not certified
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

say()  { printf '\n\033[1;36m▶ %b\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %b\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %b\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."

SITE_URL="${SITE_URL:-https://nongkatistore.com}"
WAIT="${DEPLOY_WAIT_SECONDS:-900}"
START_EPOCH="$(date +%s)"

# shellcheck source=lib/certify.sh
. "scripts/lib/certify.sh"

[ -f package.json ] && [ -f server.js ] || die "Run from the app root (package.json / server.js missing)."
command -v git >/dev/null || die "git not found."
command -v curl >/dev/null || die "curl not found."

# Fail BEFORE publishing if nobody could certify the result afterwards.
if [ "${DRY_RUN:-0}" != "1" ]; then
  certify_precondition "$SITE_URL" || exit $?
fi

# ── 1. Publish ───────────────────────────────────────────────────────────────
say "Step 1/3 — publish the bundle (scripts/deploy-artifact.sh)"
bash scripts/deploy-artifact.sh
BUILD_ID="$(cat .next/BUILD_ID 2>/dev/null || true)"
[ -n "$BUILD_ID" ] || die "the build produced no .next/BUILD_ID — nothing to publish."

if [ "${DRY_RUN:-0}" = "1" ]; then
  say "DRY_RUN=1 — bundle staged only (BUILD_ID=$BUILD_ID). Nothing was published, switched or certified."
  exit 0
fi

# ── 2. Switch (one panel click), then wait for it to land ────────────────────
say "Step 2/3 — switch production in Plesk"
cat <<HANDOFF
  Plesk → nongkatistore.com → Scheduled Tasks → your deploy task → Run Now
  (do NOT save — the field must keep the current guarded command).
  Expected BUILD_ID : $BUILD_ID
  This script is watching $SITE_URL/api/v1/version and continues by itself once the
  site serves that build — no second command to remember.
HANDOFF

LIVE=""
DEADLINE=$(( START_EPOCH + WAIT ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  LIVE="$(curl -s --max-time 10 "$SITE_URL/api/v1/version?cb=$RANDOM$RANDOM" \
          | grep -o '"buildId":"[^"]*"' | cut -d'"' -f4 || true)"
  if [ "$LIVE" = "$BUILD_ID" ]; then break; fi
  printf '  waiting… live=%s (BUILD_ID %s) %ss left\n' "${LIVE:-unreachable}" "$BUILD_ID" \
    "$(( DEADLINE - $(date +%s) ))"
  sleep 15
done

if [ "$LIVE" != "$BUILD_ID" ]; then
  printf '\n\033[1;31m✖ THE SWITCH DID NOT LAND\033[0m\n' >&2
  printf '  Expected BUILD_ID %s, the site still serves %s after %ss.\n' "$BUILD_ID" "${LIVE:-<unreachable>}" "$WAIT" >&2
  printf '  Nothing was certified. Re-run Run Now, or raise DEPLOY_WAIT_SECONDS.\n' >&2
  printf '  When it is live: SITE_URL=%s bash scripts/deploy-full.sh --postswitch-only\n' "$SITE_URL" >&2
  exit 1
fi

say "Switched: $SITE_URL is serving $BUILD_ID"

# ── 3. Certify ───────────────────────────────────────────────────────────────
# Uptime bound = how long this deploy took + slack, so a process older than the
# deploy (old build still answering) fails the restart check.
CERTIFY_MAX_UPTIME=$(( $(date +%s) - START_EPOCH + 300 ))
say "Step 3/3 — certify"
CERTIFY_RC=0
certify_release "$SITE_URL" "$CERTIFY_MAX_UPTIME" "BUILD_ID live  : $BUILD_ID" || CERTIFY_RC=$?
exit "$CERTIFY_RC"
