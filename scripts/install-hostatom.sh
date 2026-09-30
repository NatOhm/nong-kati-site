#!/usr/bin/env bash
# ─── Nong-Kati server-side installer (no-SSH fallback) ───────────────────
# For Hostatom/Plesk when SSH access is unavailable. Runs via a Plesk
# Scheduled Task after deploy-bundle.tar.gz + this file are uploaded into
# httpdocs with File Manager. Full click-by-click guide:
#   docs/deploy-hostatom-manual.md
#
# Does the same as the SSH half of deploy-hostatom.sh:
#   extract bundle → npm ci (Linux-native Prisma/SWC) → prisma generate
#   → prune devDependencies → touch tmp/restart.txt (Passenger restart)
#
# Idempotent: safe to re-run after a failure or a new deploy.
# Output goes wherever the Scheduled Task sends it (install.log).
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Nong-Kati install $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="

# Scheduled Tasks don't inherit the Node version picked in the Plesk
# Node.js panel — Plesk installs those under /opt/plesk/node/<major>/bin.
# Prepend Node 20 (matches the panel's 20.20.2).
if [ -d /opt/plesk/node/20/bin ]; then
  export PATH="/opt/plesk/node/20/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "FATAL: node not found in PATH"; exit 1; }
echo "node $(node -v), npm $(npm -v)"

# Extract the bundle unless File Manager already unpacked it.
if [ -f deploy-bundle.tar.gz ]; then
  echo "--- extracting deploy-bundle.tar.gz ---"
  tar -xzf deploy-bundle.tar.gz
  rm -f deploy-bundle.tar.gz
fi
[ -f package.json ] || { echo "FATAL: package.json missing — bundle not uploaded?"; exit 1; }

echo "--- npm ci (installs Linux-native Prisma/SWC binaries) ---"
npm ci

echo "--- prisma generate ---"
npx prisma generate

echo "--- npm prune --omit=dev ---"
npm prune --omit=dev

mkdir -p tmp
touch tmp/restart.txt   # Passenger picks this up and restarts the app
echo "INSTALL_OK"
