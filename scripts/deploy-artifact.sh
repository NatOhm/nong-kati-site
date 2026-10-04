#!/usr/bin/env bash
# ─── Nong-Kati — deploy-artifact.sh (local Step 0+1 of docs/deploy-hostatom-manual.md) ───
#
# Automates the two manual local steps of the working Hostatom deploy path:
#   0. build + stage the Linux-portable bundle (no node_modules, no .env)
#   1. publish it as the `deploy-artifact` branch (bundle-as-branch, force-pushed)
# then prints everything you need for the Plesk half (Step 2): the chroot-safe
# scheduled-task one-liner and the verification curls.
#
# The Plesk half stays manual on purpose (panel session, Run-Now, don't-save).
#
# Usage (Git Bash on Windows / any POSIX shell):
#   bash scripts/deploy-artifact.sh                # build + push + print handoff
#   SKIP_BUILD=1 bash scripts/deploy-artifact.sh   # reuse an existing fresh build
#   DRY_RUN=1 bash scripts/deploy-artifact.sh      # build + stage only, no push
#
# Env overrides (defaults match the live setup):
#   SITE_URL          (https://nongkatistore.com)
#   ARTIFACT_BRANCH   (deploy-artifact)
#   REMOTE            (origin)
#
# Safety notes:
#   - The bundle contains NO secrets: .next build output, public/, prisma/,
#     package manifests, next.config.js, server.js. .env* never copied.
#   - The artifact branch is force-pushed (bundle-as-branch by design);
#     your working tree and master are untouched.
#   - deploy-bundle.tar.gz is gitignored locally; the branch copy lives only
#     on the remote until the next force-push replaces it.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."

SITE_URL="${SITE_URL:-https://nongkatistore.com}"
ARTIFACT_BRANCH="${ARTIFACT_BRANCH:-deploy-artifact}"
REMOTE="${REMOTE:-origin}"
STAGE=".deploy-stage"
BUNDLE="deploy-bundle.tar.gz"

# ── Preflight ────────────────────────────────────────────────────────────────
[ -f package.json ] && [ -f next.config.js ] && [ -f server.js ] \
  || die "Run from the repo (scripts/ lives in the project root's clone)."
command -v tar >/dev/null || die "tar not found."
command -v git >/dev/null || die "git not found."
git diff --quiet || warn "Working tree has uncommitted changes — the bundle reflects the DISK state, not HEAD. That's fine for deploys, but GIT_SHA below is informational."

START_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

# ── Step 0: build ────────────────────────────────────────────────────────────
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  [ -f .next/BUILD_ID ] || die "SKIP_BUILD=1 but .next/BUILD_ID missing — run a build first."
  say "SKIP_BUILD=1 — reusing existing build"
else
  say "Building (NEXT_PUBLIC_SITE_URL=$SITE_URL)…"
  export NEXT_PUBLIC_SITE_URL="$SITE_URL"
  npm run build
fi

BUILD_ID="$(cat .next/BUILD_ID 2>/dev/null || true)"
[ -n "$BUILD_ID" ] || die "Build produced no .next/BUILD_ID — build failed? (see output above)"

# ── Step 0: stage + pack ─────────────────────────────────────────────────────
say "Staging bundle…"
rm -rf "$STAGE" "$BUNDLE"
mkdir -p "$STAGE"
cp -r .next "$STAGE/.next"
rm -rf "$STAGE/.next/cache"            # build cache: huge, unused at runtime
cp -r public prisma "$STAGE/"
cp package.json package-lock.json next.config.js server.js "$STAGE/"
tar -czf "$BUNDLE" -C "$STAGE" .
SIZE="$(du -h "$BUNDLE" | cut -f1)"

# Guard: bundle must not have grown absurdly (silently swallowing junk).
# ~31 MB historically; 60 MB means something big snuck in (e.g. .next/cache).
SIZE_BYTES="$(wc -c <"$BUNDLE" | tr -d '[:space:]')"
if [ "$SIZE_BYTES" -gt 62914560 ]; then
  die "Bundle is ${SIZE} (>60 MB) — something extra got staged. Inspect .deploy-stage before shipping."
fi

say "Bundle ready: $BUNDLE ($SIZE) · BUILD_ID=$BUILD_ID · git=$START_SHA"

# ── Step 1: publish as artifact branch ──────────────────────────────────────
if [ "${DRY_RUN:-0}" = "1" ]; then
  say "DRY_RUN=1 — not pushing. Local bundle + staging kept for inspection."
else
  say "Publishing bundle to $REMOTE/$ARTIFACT_BRANCH (force)…"
  # Orphan commit built in a TEMPORARY index: working tree, real index and
  # current branch are never touched. The commit contains ONLY the bundle.
  TMP_INDEX="$(mktemp)"
  trap 'rm -f "$TMP_INDEX"' EXIT
  export GIT_INDEX_FILE="$TMP_INDEX"
  git read-tree --empty
  git add -f "$BUNDLE"
  TREE="$(git write-tree)"
  COMMIT="$(git commit-tree "$TREE" -m "deploy bundle $BUILD_ID (git $START_SHA)")"
  unset GIT_INDEX_FILE
  git push "$REMOTE" "$COMMIT:refs/heads/$ARTIFACT_BRANCH" --force
  rm -f "$TMP_INDEX"
  say "Pushed $REMOTE/$ARTIFACT_BRANCH (orphan commit containing only $BUNDLE)."
fi

# ── Cleanup staging (keep $BUNDLE locally until Plesk run confirms) ─────────
rm -rf "$STAGE"

# ── Handoff: everything the Plesk half needs, copy-paste ready ──────────────
RAW_URL="https://raw.githubusercontent.com/NatOhm/nong-kati-site/$ARTIFACT_BRANCH/$BUNDLE"

cat <<SUMMARY

──────────────────────────────────────────────────────────────────────────────
 NEXT: Plesk half (docs/deploy-hostatom-manual.md Step 2–6)
──────────────────────────────────────────────────────────────────────────────
 BUILD_ID : $BUILD_ID
 git sha  : $START_SHA   → set Infisical GIT_SHA to this (GIT_REF=master) BEFORE restart

 1. Infisical → nong-kati → Production → GIT_SHA=$START_SHA, GIT_REF=master

 2. Plesk → Scheduled Tasks → Run a command → paste → Run Now (don't save):

cd httpdocs && curl -fsSLk -o deploy-bundle.tar.gz $RAW_URL && rm -rf .next && tar -xzf deploy-bundle.tar.gz && rm -f deploy-bundle.tar.gz && touch tmp/restart.txt && echo BUILD_ID_ON_DISK: > extract-check.txt && cat .next/BUILD_ID >> extract-check.txt

 3. Verify: httpdocs/extract-check.txt == BUILD_ID above
    (only if deps changed: cd httpdocs && /opt/plesk/node/20/bin/npm ci --omit=dev && /opt/plesk/node/20/bin/npx prisma generate && echo DEPS_OK > extract-check.txt)

 4. Restart: Node.js → Restart App  (fallback: console kill one-liner in the manual §Step 4)
    IDENTITY CHECK while on the Node.js dashboard: Custom environment variables →
    INFISICAL_CLIENT_ID must start with the prefix in docs/hostatom-live.md §5. If it differs,
    STOP and reconcile before restarting (see deploy-hostatom-manual.md Step 4).

 5. Verification curls:

curl -s https://nongkatistore.com/api/v1/version
#   expect buildId == $BUILD_ID above (read from .next/BUILD_ID on the server).
#   gitSha is an Infisical echo and may legitimately differ — do NOT verify on it.
curl -s https://nongkatistore.com/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products
#   expect: 200
curl -s https://nongkatistore.com/ | grep -c turbopack
#   expect: 0

 6. Cleanup: delete httpdocs/extract-check.txt via File Manager.
──────────────────────────────────────────────────────────────────────────────
SUMMARY
