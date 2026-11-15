#!/usr/bin/env bash
# ─── Nong-Kati — phase6-cutover.sh ───────────────────────────────────────────
# Phase 6 of docs/db-migration-hostatom-mariadb.md, as one command:
#
#   1. migrate deploy   prisma migrate deploy + migrate status on the target
#   2. ETL              copy every row from the Supabase source into the target
#   3. image extraction base64 `image:` rows out of the table onto disk (--skip-images drops it,
#                       leaving exactly the four steps the phase requires)
#   4. build            next build + git-sha stamp, against the target database
#   5. the gate         32-check precutover-check.mjs against the target
#
# The run stops at the FIRST non-zero exit and names the step it stopped at —
# that ordering is the whole point of the phase: an ETL before a migrated schema,
# a build before the data, or a gate before the build all "succeed" while proving
# nothing. The steps themselves (and their env handling, CLI paths, dirty-tree
# guard and per-step reporting) live in scripts/cutover-window.mjs, so there is
# one implementation of the sequence and this file cannot drift from it.
#
# Phase 6 does NOT start or stop the app. Stop Node.js in the Plesk panel before
# the ETL (it empties every target table), and write the two DATABASE_URL panel
# variables + Restart App afterwards — runbook § Phase 6 steps 2 and 5.
#
# Usage
#   TARGET_DATABASE_URL="mysql://nk_app:…@localhost:3306/nong_kati" \
#     bash scripts/phase6-cutover.sh --yes
#
#   --yes               required for a non-loopback target (this writes a real database)
#   --dry-run           print the resolved plan and exit 0 — touches nothing
#   --with-backup       also take + verify a fresh source dump (docs/db-backup-restore.md)
#   --from=STEP         resume at backup|schema|etl|verify|images|build|check
#   --skip-images       leave the base64 `image:` rows in the table — the four-step run
#   --skip-etl --skip-build --skip-check                for a resume; each one prints as skipped
#   --allow-dirty       run from a dirty working tree (not advised)
#
# Every run writes reports/phase6-<stamp>.log and prints it on failure.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;36m▶ %b\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %b\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %b\033[0m\n' "$*" >&2; exit 1; }

TARGET="${TARGET_DATABASE_URL:-}"
DRY_RUN=0
WITH_BACKUP=0
YES=0
ALLOW_DIRTY=0
SKIP_ETL=0
SKIP_IMAGES=0
SKIP_BUILD=0
SKIP_CHECK=0
FROM=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --with-backup) WITH_BACKUP=1 ;;
    --yes)         YES=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --skip-etl)    SKIP_ETL=1 ;;
    --skip-images) SKIP_IMAGES=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --skip-check)  SKIP_CHECK=1 ;;
    --from=*)      FROM="$arg" ;;
    -h|--help)     awk 'NR>2 && /^# ─/{exit} NR>2{sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)             die "unknown argument: $arg (try --help)" ;;
  esac
done

# Re-assembled in a fixed order so the driver's command line is always readable.
PASSTHROUGH=()
[ "$YES" = "1" ] && PASSTHROUGH+=(--yes)
[ "$ALLOW_DIRTY" = "1" ] && PASSTHROUGH+=(--allow-dirty)
[ -n "$FROM" ] && PASSTHROUGH+=("$FROM")
[ "$SKIP_ETL" = "1" ] && PASSTHROUGH+=(--skip-etl)
[ "$SKIP_IMAGES" = "1" ] && PASSTHROUGH+=(--skip-images)
[ "$SKIP_BUILD" = "1" ] && PASSTHROUGH+=(--skip-build)
[ "$SKIP_CHECK" = "1" ] && PASSTHROUGH+=(--skip-check)

# What will actually run, so the banner cannot promise a step a flag or --from removed.
ORDER=(schema etl images build check)
FROM_INDEX=0
if [ -n "$FROM" ]; then
  for i in "${!ORDER[@]}"; do
    if [ "${ORDER[$i]}" = "${FROM#--from=}" ]; then FROM_INDEX=$i; fi
  done
fi

STEPS_DESC=""
STEP_TOTAL=0
SKIPPED=""
for i in "${!ORDER[@]}"; do
  step="${ORDER[$i]}"
  [ "$i" -ge "$FROM_INDEX" ] || continue
  case "$step" in
    etl)    skip="$SKIP_ETL" ;;
    images) skip="$SKIP_IMAGES" ;;
    build)  skip="$SKIP_BUILD" ;;
    check)  skip="$SKIP_CHECK" ;;
    *)      skip=0 ;;
  esac
  if [ "$skip" = "1" ]; then
    SKIPPED="$SKIPPED $step"
  else
    case "$step" in
      schema) label="migrate deploy" ;;
      etl)    label="ETL" ;;
      images) label="image extraction" ;;
      build)  label="build" ;;
      check)  label="gate" ;;
      *)      label="$step" ;;
    esac
    STEPS_DESC="$STEPS_DESC $label ·"
    STEP_TOTAL=$((STEP_TOTAL + 1))
  fi
done
STEPS_DESC="$(printf '%s' "$STEPS_DESC" | sed 's/ *·$//;s/^ *//')"
SKIPPED="$(printf '%s' "${SKIPPED:-nothing}" | sed 's/^ *//')"
STEP_WORD="$([ "$STEP_TOTAL" = "1" ] && echo step || echo steps)"
[ -n "$STEPS_DESC" ] || STEPS_DESC="(nothing)"

# Phase 6 has its own backup decision (docs: take one immediately before the
# window), so the driver leaves the backup step out unless it is asked for.
STEP_ARGS=(--skip-backup)
if [ "$WITH_BACKUP" = "1" ]; then STEP_ARGS=(); fi

# ── Preflight: the target has to be a MariaDB copy, never the source ─────────
[ -n "$TARGET" ] || die "TARGET_DATABASE_URL is required (mysql://user:pass@host:3306/nong_kati)."
case "$TARGET" in
  mysql://*|mysqls://*) : ;;
  *) die "TARGET_DATABASE_URL must be a mysql:// URL — got ${TARGET%%://*}://… (Postgres is the source, never the target)." ;;
esac
case "$TARGET" in
  *supabase*|*pooler*) die "refusing a Supabase target: Phase 6 writes into the database it points at." ;;
esac
command -v node >/dev/null 2>&1 || die "node is not on PATH — Phase 6 drives node scripts."
[ -d node_modules ] || die "node_modules missing — run 'npm ci' first."
[ -f scripts/cutover-window.mjs ] || die "scripts/cutover-window.mjs is missing — it is the implementation of these steps."

# ── Preflight: the build-time public URL ─────────────────────────────────────
# NEXT_PUBLIC_SITE_URL is baked into the artifact by `next build`, and .env.local in a
# workstation checkout points at http://localhost:4200. A window run that forgets to export
# the real one ships a production build with localhost links and fulfilment that fails closed.
SITE_URL_EFFECTIVE="$(node -e "
const fs = require('fs');
let v = process.env.NEXT_PUBLIC_SITE_URL || '';
if (!v && fs.existsSync('.env.local')) {
  const m = /^\\s*NEXT_PUBLIC_SITE_URL\\s*=\\s*(.*)$/m.exec(fs.readFileSync('.env.local', 'utf8'));
  if (m) v = m[1];
}
process.stdout.write(v.trim().replace(/^[\"']|[\"']$/g, ''));
")"
case "$TARGET" in
  *@127.0.0.1*|*@localhost*|*@\[::1\]*) LOOPBACK_TARGET=1 ;;
  *) LOOPBACK_TARGET=0 ;;
  *);;
esac
case "$SITE_URL_EFFECTIVE" in
  "") die "NEXT_PUBLIC_SITE_URL is empty — the build would ship without it and fulfilment fails closed." ;;
  *localhost*|*127.0.0.1*)
    if [ "$LOOPBACK_TARGET" = "1" ]; then
      warn "NEXT_PUBLIC_SITE_URL=$SITE_URL_EFFECTIVE — fine for the local copy, wrong for production."
    else
      die "NEXT_PUBLIC_SITE_URL=$SITE_URL_EFFECTIVE would be baked into a production build.\n  export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com before running this window."
    fi
    ;;
esac

# A tunnel target on loopback shares the port with anything else on this machine.
case "$TARGET" in
  *@127.0.0.1:*|*@localhost:*)
    TARGET_PORT="$(printf '%s' "$TARGET" | sed -E 's#.*@[^:/]+:([0-9]+)/.*#\1#')"
    if command -v netstat >/dev/null 2>&1 && netstat -ano 2>/dev/null | grep -q ":${TARGET_PORT} .*LISTENING"; then
      warn "port $TARGET_PORT already has a listener — make sure it is the SSH tunnel and not the\n  local rehearsal database (nk-mariadb also binds 3307). If it is the container, either stop it\n  or tunnel on another port: ssh -N -L 3308:localhost:3306 … and point TARGET at :3308."
    fi
    ;;
esac

SAFE_TARGET="$(printf '%s' "$TARGET" | sed -E 's#//[^@]*@#//***@#')"
STAMP="$(date "+%Y%m%d-%H%M%S")"
LOG="reports/phase6-${STAMP}.log"
mkdir -p reports

say "Phase 6 — cutover sequence  ($(date '+%Y-%m-%d %H:%M:%S'))"
printf '  target : %s\n' "$SAFE_TARGET"
printf '  log    : %s\n' "$LOG"
printf '  steps  : %s\n' "$STEPS_DESC"
printf '  stop at the first failure; %s\n' \
  "$([ "$WITH_BACKUP" = "1" ] && echo 'backup + verify runs first' || echo 'no backup step (pass --with-backup to take one)')"

if [ "$DRY_RUN" = "1" ]; then
  say "Dry run — plan only, nothing is executed"
  [ "$WITH_BACKUP" = "1" ] || warn "Phase 6 assumes a verified dump taken immediately before it — see docs/db-backup-restore.md."
  printf '  0. target database exists?                               (a missing one is refused, never created)\n'
  printf '  1. prisma migrate deploy  &&  prisma migrate status      (DATABASE_URL=target)\n'
  if [ "$SKIP_ETL" = "1" ]; then
    printf '  2. ETL copy                                              (skipped by --skip-etl)\n'
  else
    printf '  2. node scripts/migrate-supabase-to-mariadb.mjs          (source from .env.local)\n'
  fi
  # Reconcile is NOT gated by --skip-etl: it runs unless --from starts later.
  printf '     node scripts/migrate-supabase-to-mariadb.mjs --verify-only\n'
  if [ "$SKIP_IMAGES" = "1" ]; then
    printf '  3. image extraction                                      (skipped by --skip-images)\n'
  else
    printf '  3. node scripts/extract-images-to-files.mjs --apply      (DATABASE_URL=target)\n'
  fi
  printf '  4. next build  &&  node scripts/stamp-git-sha.mjs        (NEXT_PUBLIC_SITE_URL required)\n'
  printf '  5. node scripts/precutover-check.mjs                     (32 checks)\n'
  printf '\n  skipped: %s\n' "$SKIPPED"
  printf '  the driver: node scripts/cutover-window.mjs %s %s\n' "${STEP_ARGS[*]}" "${PASSTHROUGH[*]:-}"
  printf '  human steps this does not do: Plesk → Node.js → Stop before the ETL; add DATABASE_URL +\n'
  printf '  DATABASE_DIRECT_URL, Restart App, then /api/v1/health and one real slip (runbook Phase 6).\n'
  exit 0
fi

# ── Preflight: the target database must ALREADY exist ─────────────────────────
# `prisma migrate deploy` CREATES a missing MySQL database instead of failing
# (measured 2026-11-15: it printed "MySQL database nk_p6_absent created"). A typo in
# TARGET_DATABASE_URL therefore migrates an empty schema and the ETL then copies
# production rows into it — a window that reports success against a database nobody
# meant to create. The only safe moment to notice is before step 1, and a missing
# database must never be reported as an unreachable server, or the other way round.
say "Checking the target database already exists"
DB_NAME="$(printf '%s' "$TARGET" | sed -E 's#^[a-zA-Z]+://[^/]*/([^?]*).*#\1#')"
set +e
DB_PROBE="$(node scripts/target-db-check.mjs --url="$TARGET" 2>&1)"
DB_STATUS=$?
set -e
printf '  %s\n' "$DB_PROBE"
case "$DB_STATUS" in
  0) : ;;
  3) die "refusing to run Phase 6: the target database \"$DB_NAME\" does not exist.
  prisma migrate deploy would CREATE it, migrate an empty schema, and the ETL would then
  copy production rows into a database nobody meant to create. Create it first (Phase 5
  does this), then re-run:
    CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  Nothing was changed." ;;
  4) die "refusing to run Phase 6: the target database server cannot be reached.
  That is not a missing database — check the SSH tunnel (ssh -N -L 3306:127.0.0.1:3306 …)
  and the host/port in TARGET_DATABASE_URL. Nothing was changed." ;;
  *) die "refusing to run Phase 6: the target database check failed (exit $DB_STATUS).
  $(printf '%s' "$DB_PROBE" | head -3)" ;;
esac

set +e
node scripts/cutover-window.mjs ${STEP_ARGS[@]+"${STEP_ARGS[@]}"} ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"} 2>&1 | tee "$LOG"
STATUS=${PIPESTATUS[0]}
set -e

if [ "$STATUS" != "0" ]; then
  warn "Phase 6 stopped at the first failure (exit $STATUS) — nothing after it ran."
  printf '  evidence : %s\n' "$LOG"
  printf '  rollback : docs/PLESK-CUTOVER.md §4 — Supabase is untouched, so reverting the two panel\n'
  printf '             values and Restart App is a two-minute revert.\n'
  printf '  resume   : fix the cause, then re-run with --from=STEP (schema|etl|verify|images|build|check).\n'
  exit "$STATUS"
fi

say "Phase 6 sequence complete — $STEP_TOTAL $STEP_WORD passed: $STEPS_DESC"
printf '  evidence : %s\n' "$LOG"
printf '  next     : 1. read the gate output above (32/32)\n'
printf '             2. Plesk → Node.js → add DATABASE_URL + DATABASE_DIRECT_URL → Restart App\n'
printf '             3. /api/v1/health → database: ok, /api/v1/version → expected BUILD_ID\n'
printf '             4. one real order + slip end to end, then Phase 7: scripts/postswitch-check.mjs\n'
