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
# Publishing is NOT releasing: this script stops before the switch and before the
# post-switch gate. Use scripts/deploy-manual.sh when you actually want a release —
# it publishes, waits for your one Run-Now click, then certifies the result and
# exits non-zero if the gate fails.
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
# .github/workflows/postswitch-gate.yml watches `deploy-artifact` by name (and only
# starts because this commit carries its file). Ship under another name and the push
# still deploys, but no CI certification ever runs — silently, which is the worst kind.
if [ "$ARTIFACT_BRANCH" != "deploy-artifact" ]; then
  printf '⚠ ARTIFACT_BRANCH=%s — postswitch-gate.yml watches deploy-artifact, so this\n  release will NOT be certified in CI.\n' "$ARTIFACT_BRANCH" >&2
fi
STAGE=".deploy-stage"
BUNDLE="deploy-bundle.tar.gz"

# ── Preflight ────────────────────────────────────────────────────────────────
[ -f package.json ] && [ -f next.config.js ] && [ -f server.js ] \
  || die "Run from the repo (scripts/ lives in the project root's clone)."
command -v tar >/dev/null || die "tar not found."
command -v git >/dev/null || die "git not found."
git diff --quiet || warn "Working tree has uncommitted changes — the build stamps <sha>-dirty and the pack guard below will REFUSE it. Commit, then re-run."

START_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

# ── Guard: the release commit must be reachable from a branch ───────────────
# The build the site served for two days was `206a6a2`, a commit on NO branch
# (P0-2): live code that cannot be rebuilt from source, and nothing noticed.
# A detached HEAD is exactly how that happens, so refuse to publish one. Local
# branches and remote-tracking ones both count — the commit has to be somewhere
# a `git checkout` can find it. (This asks the local clone on purpose: the CI
# clone is shallow and this repo's history is ~2.6 GB, so an ancestry question
# is only answerable at publish time, not in CI.)
# `for-each-ref`, not `git branch --contains`: on a detached HEAD the latter prints
# the pseudo-entry "(HEAD detached from …)" even with --format, which reads as a
# branch and would let the exact build this guard exists to stop straight through
# (measured: the first version of this guard passed a detached commit).
ON_BRANCH="$(git for-each-ref --contains "$START_SHA" --format='%(refname:short)' \
               refs/heads refs/remotes 2>/dev/null | head -1 || true)"
[ -n "$ON_BRANCH" ] || die "git $START_SHA is on no branch, so this release could never be rebuilt from source. Check it out on a branch (or tag it and record the tag) and rebuild — refusing to publish a detached build (P0-2)."
say "Release commit is on ${ON_BRANCH}"

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
# .htaccess (source-file 403s) and server-bootstrap.js (required by server.js)
# ship on THIS route too — it is the route that actually deploys; without them
# the tar bundle is less complete than the zip one (.make-bundle.ps1 stages
# both) and the web-exposed source tree stays readable.
cp package.json package-lock.json next.config.js server.js server-bootstrap.js .htaccess "$STAGE/"
tar -czf "$BUNDLE" -C "$STAGE" .
SIZE="$(du -h "$BUNDLE" | cut -f1)"

# Guard: bundle must not have grown absurdly (silently swallowing junk).
# ~31 MB historically; 60 MB means something big snuck in (e.g. .next/cache).
SIZE_BYTES="$(wc -c <"$BUNDLE" | tr -d '[:space:]')"
if [ "$SIZE_BYTES" -gt 62914560 ]; then
  die "Bundle is ${SIZE} (>60 MB) — something extra got staged. Inspect .deploy-stage before shipping."
fi

say "Bundle ready: $BUNDLE ($SIZE) · BUILD_ID=$BUILD_ID · git=$START_SHA"

# ── Guard: the packed stamps must name a real commit ────────────────────────
# Same rule .verify-bundle.ps1 applies to the zip route, read off the tar
# itself (what actually ships) rather than the disk. A dirty build compiles
# code that exists in NO commit, so it can be named, rolled back or diffed
# against production by nothing; a mismatched BUILD_ID means the tar is not
# the build we just made. Both are cheaper to catch here than on Plesk.
TAR_BUILD_ID="$(tar -xzOf "$BUNDLE" ./.next/BUILD_ID 2>/dev/null | tr -d '[:space:]')"
TAR_GIT_SHA="$(tar -xzOf "$BUNDLE" ./.next/GIT_SHA 2>/dev/null | tr -d '[:space:]')"
[ "$TAR_BUILD_ID" = "$BUILD_ID" ] \
  || die "Bundle BUILD_ID '$TAR_BUILD_ID' is not the build we just made ('$BUILD_ID') — refit the tar, do not ship it."
case "$TAR_GIT_SHA" in
  (*-dirty) die "Bundle was built from an uncommitted working tree ($TAR_GIT_SHA), so it matches NO commit. Commit, then re-run." ;;
esac
echo "$TAR_GIT_SHA" | grep -Eq '^[0-9a-f]{40}$' \
  || die "Bundle GIT_SHA '$TAR_GIT_SHA' is not a 40-hex commit id — stamp-git-sha.mjs did not run."
say "Stamps verified: BUILD_ID=$TAR_BUILD_ID · git=$TAR_GIT_SHA (clean)"

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
  # GitHub only starts a `push` workflow when that workflow's file is present in the
  # pushed commit's own tree. This branch is otherwise just the tarball, so the
  # post-switch gate's workflow must travel with it or the gate can never fire
  # (measured 2026-11-15: without this, nothing runs on the push at all). The job
  # still checks out the source commit named in the subject; this tree only supplies
  # the gate scripts when that source commit predates them.
  if [ -f .github/workflows/postswitch-gate.yml ]; then
    git add -f .github/workflows/postswitch-gate.yml
  fi
  # Same reason, one level down: a release built before the gate existed has no
  # scripts/ci-postswitch-gate.sh in its tree, so the job could not run the gate
  # against it at all. Carrying the gate scripts here makes every artifact
  # certifiable regardless of how old its source commit is.
  for f in scripts/ci-postswitch-gate.sh scripts/wait-for-build.mjs scripts/postswitch-check.mjs; do
    [ -f "$f" ] && git add -f "$f"
  done
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
# Pin the artifact COMMIT, not the branch: a sha can only serve the bytes it was
# pushed with, so a copy of a different release cannot reach the docroot (that is
# how 1.1.1's first Run Now reinstalled its predecessor). DRY_RUN published
# nothing, so its line carries a placeholder — a branch there would stage
# whatever the last real publish left behind.
COMMIT_REF="${COMMIT:-COMMIT-SHA-FROM-THE-PUSH}"
RAW_URL="https://raw.githubusercontent.com/NatOhm/nong-kati-site/$COMMIT_REF/$BUNDLE"
[ -n "${COMMIT:-}" ] || warn "DRY_RUN=1 published nothing: the URL below is a placeholder and answers 404. Re-run without DRY_RUN for a usable line."

cat <<SUMMARY

──────────────────────────────────────────────────────────────────────────────
 NEXT: Plesk half (docs/deploy-hostatom-manual.md Step 2–6)
──────────────────────────────────────────────────────────────────────────────
 BUILD_ID : $BUILD_ID
 git sha  : $START_SHA   → set Infisical GIT_SHA to this (GIT_REF=master) BEFORE restart

 1. Infisical → nong-kati → Production → GIT_SHA=$START_SHA, GIT_REF=master

 2. Plesk → Scheduled Tasks → Run a command → paste → Run Now (don't save):

cd httpdocs && rm -rf .next-stage && curl -fsSLk --max-time 180 -o deploy-bundle.tar.gz $RAW_URL?cb=\$\$ && mkdir -p .next-stage && tar -xzf deploy-bundle.tar.gz -C .next-stage && grep -Fxq $BUILD_ID .next-stage/.next/BUILD_ID && grep -Fxq $START_SHA .next-stage/.next/GIT_SHA && rm -rf .next.old && if test -d .next; then mv .next .next.old; fi && mv .next-stage/.next .next && cp -a .next-stage/. . && rm -rf .next-stage deploy-bundle.tar.gz && { cat .next/BUILD_ID; echo; cat .next/GIT_SHA; echo; } > extract-check.txt && touch tmp/restart.txt

 3. Verify: httpdocs/extract-check.txt — line 1 == BUILD_ID above, line 2 == $START_SHA,
    exactly. The task compared both stamps to those literals BEFORE the swap, so no file
    means nothing moved (the previous build is still live, .next-stage is kept for
    inspection) and a mismatch cannot have reached the docroot; .next.old is the on-disk
    rollback if the swap itself ever has to be undone.
    Node.js → Run Node.js commands (NOT a Scheduled Task — the task chroot has no node binary
    at all; find / -name node -type f returns nothing there):
      · deps changed (package.json)      →  npm ci --omit=dev
      · prisma/schema.prisma changed     →  npm run postinstall      (= prisma generate)
    The second one is REQUIRED whenever a schema change ships: the extracted bundle carries no
    node_modules, so a stale Prisma Client makes every query on that model throw.

 4. Restart: Node.js → Restart App  (fallback: console kill one-liner in the manual §Step 4)
    IDENTITY CHECK while on the Node.js dashboard: Custom environment variables →
    INFISICAL_CLIENT_ID must start with the prefix in docs/hostatom-live.md §5. If it differs,
    STOP and reconcile before restarting (see deploy-hostatom-manual.md Step 4).

 5. Verification curls:

curl -s https://nongkatistore.com/api/v1/version
#   expect buildId == $BUILD_ID above AND gitSha == $START_SHA: stamp-git-sha.mjs
#   writes the commit INTO .next/GIT_SHA at build time, and the route prefers
#   that stamp over the env var — the SHA is now the verification signal
#   (before 2026-10-27 it was a stale Infisical echo and could not be trusted).
curl -s https://nongkatistore.com/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products
#   expect: 200
curl -s https://nongkatistore.com/ | grep -c turbopack
#   expect: 0

 6. Cleanup: delete httpdocs/extract-check.txt via File Manager.
──────────────────────────────────────────────────────────────────────────────
SUMMARY
