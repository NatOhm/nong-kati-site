#!/usr/bin/env bash
# ─── Nong-Kati — deploy-full.sh ──────────────────────────────────────────────
# Complete deploy loop from a local machine, WITHOUT the Plesk panel:
#
#   1. build        — next build (or SKIP_BUILD=1 to reuse .next / the bundle)
#   2. pack         — Linux-portable tarball (.next w/o cache, public, prisma,
#                     package manifests, next.config.js, server.js; NEVER
#                     node_modules, NEVER .env)
#   3. upload       — force-publish the bundle as the `deploy-artifact` orphan
#                     branch (this is what the Plesk task / the panel one-liner
#                     pull from raw.githubusercontent.com). Skipped when the
#                     remote tip already carries this exact BUILD_ID.
#   4. Run-Now      — one interactive SSH connection (password prompt) that
#                     runs the same effect as the Plesk scheduled task: stream
#                     the LOCAL bundle into httpdocs, run npm ci / prisma
#                     generate ONLY when package.json or schema.prisma drifted,
#                     touch tmp/restart.txt. Any failure rolls .next back.
#   5. verify       — poll /api/v1/version until the new BUILD_ID serves, then
#                     check extract-check.txt + health.
#
# If SSH auth fails, the script prints the panel Run-Now one-liner (GitHub raw
# path) so the deploy can still be finished by hand — nothing is left half-done
# because the remote step is atomic (rollback on error) and the app keeps
# serving the old build until restart.txt is touched.
#
# Usage (Git Bash on Windows):
#   export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com   # baked at build
#   bash scripts/deploy-full.sh                 # full loop, password prompt
#   SKIP_BUILD=1 bash scripts/deploy-full.sh    # reuse fresh build/bundle
#   DRY_RUN=1 bash scripts/deploy-full.sh       # everything except ssh + push
#
# Env overrides:
#   HOSTATOM_SSH_HOST (thsv93.hostatom.com)  HOSTATOM_SSH_USER (nongka)
#   HOSTATOM_SSH_PORT (22)                   SITE_URL (https://nongkatistore.com)
#   ARTIFACT_BRANCH  (deploy-artifact)       REMOTE (origin)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."

SITE_URL="${SITE_URL:-https://nongkatistore.com}"
ARTIFACT_BRANCH="${ARTIFACT_BRANCH:-deploy-artifact}"
REMOTE="${REMOTE:-origin}"
SSH_HOST="${HOSTATOM_SSH_HOST:-thsv93.hostatom.com}"
SSH_USER="${HOSTATOM_SSH_USER:-nongka}"
SSH_PORT="${HOSTATOM_SSH_PORT:-22}"
BUNDLE="deploy-bundle.tar.gz"
STAGE=".deploy-stage"

# ── 0. Preflight ─────────────────────────────────────────────────────────────
[ -f package.json ] && [ -f next.config.js ] && [ -f server.js ] \
  || die "Run from the app root (package.json / next.config.js / server.js missing)."
command -v tar  >/dev/null || die "tar not found (run from Git Bash)."
command -v git  >/dev/null || die "git not found."
command -v ssh  >/dev/null || die "ssh not found."

# ── 1. Build (or reuse) ──────────────────────────────────────────────────────
BUILD_ID=""
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  if [ -f .next/BUILD_ID ]; then
    BUILD_ID="$(cat .next/BUILD_ID)"
    say "SKIP_BUILD=1 — reusing existing build (BUILD_ID=$BUILD_ID)"
    rm -rf "$STAGE" "$BUNDLE"
    mkdir -p "$STAGE"
    cp -r .next "$STAGE/.next"; rm -rf "$STAGE/.next/cache"
    cp -r public prisma "$STAGE/"
    cp package.json package-lock.json next.config.js server.js "$STAGE/"
    tar -czf "$BUNDLE" -C "$STAGE" .
    rm -rf "$STAGE"
  elif [ -f "$BUNDLE" ]; then
    BUILD_ID="$(tar -xzOf "$BUNDLE" ./.next/BUILD_ID 2>/dev/null || true)"
    [ -n "$BUILD_ID" ] || die "SKIP_BUILD=1 but $BUNDLE has no ./.next/BUILD_ID — run without SKIP_BUILD."
    say "SKIP_BUILD=1 — reusing existing $BUNDLE (BUILD_ID=$BUILD_ID)"
  else
    die "SKIP_BUILD=1 but neither .next/BUILD_ID nor $BUNDLE exists."
  fi
else
  [ -n "${NEXT_PUBLIC_SITE_URL:-}" ] || [ -f .env.production ] || die \
    "NEXT_PUBLIC_SITE_URL must be set before building:\n  export NEXT_PUBLIC_SITE_URL=$SITE_URL"
  [ -d node_modules ] || die "node_modules missing — run 'npm ci' first."
  say "Building (NEXT_PUBLIC_SITE_URL=$SITE_URL)…"
  export NEXT_PUBLIC_SITE_URL="$SITE_URL"
  npm run build
  BUILD_ID="$(cat .next/BUILD_ID 2>/dev/null || true)"
  [ -n "$BUILD_ID" ] || die "Build produced no .next/BUILD_ID."
  say "Staging bundle…"
  rm -rf "$STAGE" "$BUNDLE"
  mkdir -p "$STAGE"
  cp -r .next "$STAGE/.next"; rm -rf "$STAGE/.next/cache"
  cp -r public prisma "$STAGE/"
  cp package.json package-lock.json next.config.js server.js "$STAGE/"
  tar -czf "$BUNDLE" -C "$STAGE" .
  rm -rf "$STAGE"
fi

# ── 2. Bundle guards ─────────────────────────────────────────────────────────
SIZE_BYTES="$(wc -c <"$BUNDLE" | tr -d '[:space:]')"
[ "$SIZE_BYTES" -le 62914560 ] || die "Bundle is $(du -h "$BUNDLE" | cut -f1) (>60 MB) — something extra got staged."
tar -tzf "$BUNDLE" | grep -q '\\' && die "Bundle has backslash entry names — built on/for the wrong OS."
tar -tzf "$BUNDLE" | grep -qE '^\.\.?/\.env' && die "Bundle contains a .env file — secrets must never ship."
say "Bundle OK: $BUNDLE ($(du -h "$BUNDLE" | cut -f1)) · BUILD_ID=$BUILD_ID"

# ── 3. Upload: publish as artifact branch ────────────────────────────────────
PUSHED="already-published"
if [ "${DRY_RUN:-0}" = "1" ]; then
  warn "DRY_RUN=1 — skipping branch publish and server install."
else
  if git fetch "$REMOTE" "$ARTIFACT_BRANCH" >/dev/null 2>&1 \
     && git log -1 --format=%s FETCH_HEAD 2>/dev/null | grep -qF "$BUILD_ID"; then
    say "Upload: $REMOTE/$ARTIFACT_BRANCH already carries BUILD_ID $BUILD_ID — skip push."
  else
    say "Upload: publishing bundle to $REMOTE/$ARTIFACT_BRANCH (orphan commit, force)…"
    TMP_INDEX="$(mktemp)"
    GIT_INDEX_FILE="$TMP_INDEX" sh -c '
      git read-tree --empty && git add -f "'"${BUNDLE//\'/}"'" && git write-tree
    ' >"$TMP_INDEX.tree"
    TREE="$(cat "$TMP_INDEX.tree")"
    COMMIT="$(git commit-tree "$TREE" -m "deploy bundle $BUILD_ID (git $(git rev-parse HEAD))")"
    rm -f "$TMP_INDEX" "$TMP_INDEX.tree"
    git push "$REMOTE" "$COMMIT:refs/heads/$ARTIFACT_BRANCH" --force
    PUSHED="pushed"
    say "Pushed $REMOTE/$ARTIFACT_BRANCH → $COMMIT"
  fi
fi

# ── 4. Run-Now over SSH (one connection, password prompted once) ─────────────
RAW_URL="https://raw.githubusercontent.com/NatOhm/nong-kati-site/$ARTIFACT_BRANCH/$BUNDLE"
REMOTE_SCRIPT="$(cat <<'REMOTE'
set -euo pipefail
cd ~/httpdocs 2>/dev/null || cd /var/www/vhosts/nongkatistore.com/httpdocs
PKG_B="$(md5sum package.json package-lock.json 2>/dev/null || echo none)"
SCH_B="$(md5sum prisma/schema.prisma 2>/dev/null || echo none)"
OLD="$(cat .next/BUILD_ID 2>/dev/null || echo none)"
rollback() {
  rm -rf .next
  [ -d .next.prev ] && mv .next.prev .next
  echo "REMOTE_FAILED — .next restored to $OLD; app was NOT restarted."
}
trap rollback ERR
rm -rf .next.prev
[ -d .next ] && mv .next .next.prev
tar -xzf -                                     # bundle arrives on stdin
PKG_A="$(md5sum package.json package-lock.json 2>/dev/null || echo none)"
SCH_A="$(md5sum prisma/schema.prisma 2>/dev/null || echo none)"
if [ "$PKG_B" != "$PKG_A" ]; then
  echo "DEPS_CHANGED — running npm ci --omit=dev"
  npm ci --omit=dev
fi
if [ "$PKG_B" != "$PKG_A" ] || [ "$SCH_B" != "$SCH_A" ]; then
  echo "SCHEMA_OR_DEPS_CHANGED — running prisma generate"
  npx prisma generate
fi
mkdir -p tmp && touch tmp/restart.txt           # Passenger restart signal
echo "BUILD_ID_ON_DISK:" > extract-check.txt
cat .next/BUILD_ID >> extract-check.txt
rm -rf .next.prev
trap - ERR
echo "REMOTE_DONE old=$OLD new=$(cat .next/BUILD_ID)"
REMOTE
)"

if [ "${DRY_RUN:-0}" = "1" ]; then
  say "DRY_RUN=1 — skipping SSH Run-Now."
else
  say "Run-Now: connecting to $SSH_USER@$SSH_HOST:$SSH_PORT (you will be asked for the SSH password once)…"
  if ! ssh -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 \
       "$SSH_USER@$SSH_HOST" "bash -c $(printf '%q' "$REMOTE_SCRIPT")" < "$BUNDLE"; then
    warn "SSH step failed (auth or connection). Finish the deploy with the panel one-liner:"
    printf '\n  cd httpdocs && curl -fsSLk -o %s %s && rm -rf .next && tar -xzf %s && rm -f %s && touch tmp/restart.txt && echo BUILD_ID_ON_DISK: > extract-check.txt && cat .next/BUILD_ID >> extract-check.txt\n\n' \
      "$BUNDLE" "$RAW_URL" "$BUNDLE" "$BUNDLE"
    printf '  then: Node.js → Restart App. Expected BUILD_ID: %s\n\n' "$BUILD_ID"
    exit 2
  fi
fi

# ── 5. Verify ────────────────────────────────────────────────────────────────
if [ "${DRY_RUN:-0}" = "1" ]; then
  say "DRY_RUN=1 — skipping verify (nothing was changed)."
  exit 0
fi
say "Verify: polling $SITE_URL/api/v1/version for BUILD_ID $BUILD_ID (up to 90 s)…"
LIVE=""
for i in $(seq 1 18); do
  LIVE="$(curl -s --max-time 15 "$SITE_URL/api/v1/version?cb=$RANDOM$RANDOM" \
          | grep -o '"buildId":"[^"]*"' | cut -d'"' -f4 || true)"
  [ "$LIVE" = "$BUILD_ID" ] && break
  sleep 5
done
CHECK="$(curl -s --max-time 15 "$SITE_URL/extract-check.txt" | tail -1 || true)"
HEALTH="$(curl -s --max-time 15 "$SITE_URL/api/v1/health" | head -c 200 || true)"

cat <<SUMMARY

──────────────────────────────────────────────────────────────────────────────
 Deploy result
──────────────────────────────────────────────────────────────────────────────
 BUILD_ID built : $BUILD_ID
 branch         : $PUSHED
 live buildId   : ${LIVE:-unreachable}
 extract-check  : ${CHECK:-unreachable}
 health         : ${HEALTH:-unreachable}

$([ "$LIVE" = "$BUILD_ID" ] && echo "✅ DEPLOY LANDED — production is serving $BUILD_ID." \
  || echo "⏳ Not live yet. If Run-Now ran without error, wait ~30 s and re-check
    curl -s $SITE_URL/api/v1/version — otherwise re-run Run-Now or use the
    panel one-liner printed above.")
──────────────────────────────────────────────────────────────────────────────
SUMMARY

[ "$LIVE" = "$BUILD_ID" ]
