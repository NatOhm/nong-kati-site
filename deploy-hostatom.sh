#!/usr/bin/env bash
# ─── Nong-Kati — Hostatom (Plesk + Passenger) deploy ─────────────────────
#
# Replaces the old flow that copied node_modules into the deploy package:
# Windows-built node_modules carries the Win32 Prisma query engine and
# @next/swc binary, which crash on the Linux server. This script instead:
#
#   1. builds locally (or on the server with BUILD=server),
#   2. bundles ONLY Linux-portable artifacts (.next, public, prisma, configs)
#      — never node_modules, never .env,
#   3. uploads one tarball over SFTP,
#   4. runs `npm ci` + `prisma generate` ON THE SERVER so the Linux binaries
#      (Prisma query engine, SWC) are installed natively,
#   5. touches tmp/restart.txt so Passenger picks up the new build.
#
# SECRETS ARE NEVER SHIPPED. No .env is generated or uploaded — runtime env
# belongs in Plesk → Node.js → Custom environment variables, or better, an
# Infisical machine identity (variable list: docs/vercel-env-checklist.md §2).
# PM2/ecosystem.config.js is intentionally not used: Plesk apps run under
# Passenger, which manages restarts itself.
#
# Usage (Git Bash on Windows):
#   export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com   # baked at build
#   bash deploy-hostatom.sh                                 # full deploy
#
#   BUILD=server bash deploy-hostatom.sh        # build on the server instead
#                                               # (~2 GB RAM needed; if the
#                                               #  OOM-killer strikes, use the
#                                               #  default local build)
#
#   MIGRATE=1 DATABASE_DIRECT_URL='postgresql://…:5432/…' \
#     bash deploy-hostatom.sh                   # also run prisma migrate
#                                               # deploy (direct session-mode
#                                               # URL — migrations cannot go
#                                               # through the pgbouncer pooler)
#
# Connection settings (defaults from the Plesk panel; override as env):
#   HOSTATOM_SSH_HOST (thsv93.hostatom.com)  HOSTATOM_SSH_USER (nongka)
#   HOSTATOM_SSH_PORT (22)                   HOSTATOM_REMOTE_DIR (httpdocs)
#   HOSTATOM_APP_URL   (http://nongkatistore.com)
#
# Auth: interactive SSH password prompt, or add a key via
# Plesk → Websites & Domains → SSH Access → Manage Keys for a fully
# non-interactive deploy.
#
# One-time in Plesk (not scriptable): Node.js → Application Startup File →
# change `app.js` to `server.js`. Environment variables: Plesk → Node.js →
# Custom environment variables ("specify").
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

SSH_HOST="${HOSTATOM_SSH_HOST:-thsv93.hostatom.com}"
SSH_PORT="${HOSTATOM_SSH_PORT:-22}"
SSH_USER="${HOSTATOM_SSH_USER:-nongka}"
REMOTE_DIR="${HOSTATOM_REMOTE_DIR:-httpdocs}"
APP_URL="${HOSTATOM_APP_URL:-http://nongkatistore.com}"
BUILD_MODE="${BUILD:-local}"          # local | server
DO_MIGRATE="${MIGRATE:-0}"

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"

# ── Preflight ────────────────────────────────────────────────────────────
[ -f package.json ] && [ -f next.config.js ] && [ -f server.js ] \
  || die "Run from the project root (package.json / next.config.js / server.js not found)."
command -v ssh  >/dev/null || die "ssh not found — run this from Git Bash on Windows."
command -v sftp >/dev/null || die "sftp not found — run this from Git Bash on Windows."
command -v tar  >/dev/null || die "tar not found — run this from Git Bash on Windows."

# NEXT_PUBLIC_SITE_URL is baked into the bundle at build time and
# src/lib/fulfilment.ts fails closed in production without it.
if [ "$BUILD_MODE" = "local" ]; then
  [ -n "${NEXT_PUBLIC_SITE_URL:-}" ] || [ -f .env.production ] || die \
"NEXT_PUBLIC_SITE_URL must be set before building:
  export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com"
  [ -d node_modules ] || die "node_modules missing — run 'npm ci' first, then retry."
else
  [ -n "${NEXT_PUBLIC_SITE_URL:-}" ] || die \
"BUILD=server needs NEXT_PUBLIC_SITE_URL exported (it is forwarded to the
server-side build): export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com"
fi

if [ "$DO_MIGRATE" = "1" ] && [ -z "${DATABASE_DIRECT_URL:-}" ]; then
  die "MIGRATE=1 needs DATABASE_DIRECT_URL exported (Supabase session mode :5432)."
fi

GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

# ── Build + bundle ───────────────────────────────────────────────────────
STAGE=".deploy-stage"
BUNDLE="deploy-bundle.tar.gz"
rm -rf "$STAGE" "$BUNDLE"
mkdir -p "$STAGE"

if [ "$BUILD_MODE" = "local" ]; then
  say "Building locally (next build)…"
  npm run build
  say "Assembling bundle (no node_modules, no .env)…"
  cp -r .next "$STAGE/.next"
  rm -rf "$STAGE/.next/cache"          # build cache: huge, unused at runtime
  cp -r public "$STAGE/public"
  cp -r prisma "$STAGE/prisma"
  cp package.json package-lock.json next.config.js server.js "$STAGE/"
else
  say "BUILD=server — shipping full source; the build runs on the server."
  tar -cf - \
    --exclude=node_modules --exclude=.next --exclude=.git \
    --exclude='.env*' --exclude="$BUNDLE" --exclude="$STAGE" \
    --exclude=test-results --exclude=playwright-report --exclude=artifacts \
    --exclude=tsconfig.tsbuildinfo --exclude=.vercel --exclude=tmp \
    src public prisma e2e tests scripts docs \
    package.json package-lock.json next.config.js server.js tsconfig.json \
    next-env.d.ts postcss.config.js tailwind.config.ts .eslintrc.json \
    | (cd "$STAGE" && tar -xf -)
  warn "Server-side next build needs ~2 GB RAM — the Go PL plan may not manage it."
  warn "If the build is OOM-killed, use the default local build instead."
fi

say "Packing $BUNDLE…"
tar -czf "$BUNDLE" -C "$STAGE" .
echo "  bundle: $BUNDLE ($(du -h "$BUNDLE" | cut -f1))"

# ── Upload (SFTP) ────────────────────────────────────────────────────────
say "Uploading to $SSH_USER@$SSH_HOST:$REMOTE_DIR …"
sftp -P "$SSH_PORT" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" <<SFTP
cd "$REMOTE_DIR"
put "$BUNDLE"
SFTP

# ── Install on the server ────────────────────────────────────────────────
# npm ci installs Linux-native Prisma/SWC binaries; prisma generate must run
# BEFORE pruning devDependencies (the prisma CLI is a devDependency).
say "Installing on server…"
ssh -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" \
  "$(printf "BUILD_MODE=%q NEXT_PUBLIC_SITE_URL=%q bash -s" "$BUILD_MODE" "${NEXT_PUBLIC_SITE_URL:-}")" \
  <<'REMOTE'
set -euo pipefail
cd ~/httpdocs 2>/dev/null || cd /var/www/vhosts/nongkatistore.com/httpdocs
tar -xzf deploy-bundle.tar.gz
npm ci
npx prisma generate
if [ "$BUILD_MODE" = "server" ]; then
  npm run build
fi
npm prune --omit=dev
mkdir -p tmp && touch tmp/restart.txt   # Passenger restart signal
rm -f deploy-bundle.tar.gz
echo "server install done"
REMOTE

# ── Migrations (optional) ────────────────────────────────────────────────
if [ "$DO_MIGRATE" = "1" ]; then
  say "Running prisma migrate deploy on the server…"
  {
    printf 'export DATABASE_URL=%q\n' "$DATABASE_DIRECT_URL"
    printf 'export DATABASE_DIRECT_URL=%q\n' "$DATABASE_DIRECT_URL"
    cat <<'REMOTE'
set -euo pipefail
cd ~/httpdocs 2>/dev/null || cd /var/www/vhosts/nongkatistore.com/httpdocs
npx prisma migrate deploy
REMOTE
  } | ssh -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" bash -s
fi

# ── Verify ───────────────────────────────────────────────────────────────
say "Health check: $APP_URL/api/v1/version"
sleep 3
if ! curl -fsS --max-time 20 "$APP_URL/api/v1/version"; then
  echo
  warn "Version endpoint not reachable yet — check Plesk → Logs and press Restart App."
fi

rm -rf "$STAGE" "$BUNDLE"

cat <<SUMMARY

✅ Deploy complete (git $GIT_SHA).

Post-deploy checklist:
  1. Plesk → Node.js → Application Startup File = server.js   (one-time)
  2. Runtime env in Plesk → Node.js → Custom environment variables
     (DATABASE_URL, DATABASE_DIRECT_URL, NEXT_PUBLIC_SITE_URL,
     NK_JWT_SECRET, NK_GIFT_CODE_ENCRYPTION_KEY, GIT_SHA=$GIT_SHA, …)
     — full list in docs/vercel-env-checklist.md §2. Or wire an Infisical
     machine identity so nothing sensitive sits in the panel.
  3. If the app didn't pick up the new build: Plesk → Node.js → Restart App.
  4. SSL: Plesk → SSL/TLS → Let's Encrypt (after DNS resolves to this server).
  5. Keep Vercel live until the https checks pass, then cut DNS over.

SUMMARY
