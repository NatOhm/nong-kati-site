#!/usr/bin/env bash
# ─── Nong-Kati — phase6-cutover.sh ───────────────────────────────────────────
# Phase 6 of docs/db-migration-hostatom-mariadb.md, as one command:
#
#   1. migrate deploy   prisma migrate deploy + migrate status on the target
#   2. ETL              copy every row from the Supabase source into the target
#   3. image extraction base64 `image:` rows out of the table onto disk
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
#   --skip-etl --skip-images --skip-build --skip-check   pass through, for a resume
#   --allow-dirty       run from a dirty working tree (not advised)
#
# Every run writes reports/phase6-<stamp>.log and prints it on failure.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

TARGET="${TARGET_DATABASE_URL:-}"
DRY_RUN=0
WITH_BACKUP=0
PASSTHROUGH=()

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --with-backup) WITH_BACKUP=1 ;;
    --from=*|--skip-etl|--skip-images|--skip-build|--skip-check|--allow-dirty|--yes)
      PASSTHROUGH+=("$arg") ;;
    -h|--help)     sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)             die "unknown argument: $arg (try --help)" ;;
  esac
done

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

SAFE_TARGET="$(printf '%s' "$TARGET" | sed -E 's#//[^@]*@#//***@#')"
STAMP="$(date "+%Y%m%d-%H%M%S")"
LOG="reports/phase6-${STAMP}.log"
mkdir -p reports

say "Phase 6 — cutover sequence  ($(date '+%Y-%m-%d %H:%M:%S'))"
printf '  target : %s\n' "$SAFE_TARGET"
printf '  log    : %s\n' "$LOG"
printf '  steps  : 1 migrate deploy · 2 ETL · 3 image extraction · 4 build · 5 gate\n'
printf '  stop at the first failure; %s\n' \
  "$([ "$WITH_BACKUP" = "1" ] && echo 'backup + verify runs first' || echo 'no backup step (pass --with-backup to take one)')"

if [ "$DRY_RUN" = "1" ]; then
  say "Dry run — plan only, nothing is executed"
  [ "$WITH_BACKUP" = "1" ] || warn "Phase 6 assumes a verified dump taken immediately before it — see docs/db-backup-restore.md."
  printf '  1. prisma migrate deploy  &&  prisma migrate status      (DATABASE_URL=target)\n'
  printf '  2. node scripts/migrate-supabase-to-mariadb.mjs          (source from .env.local)\n'
  printf '     node scripts/migrate-supabase-to-mariadb.mjs --verify-only\n'
  printf '  3. node scripts/extract-images-to-files.mjs --apply      (DATABASE_URL=target)\n'
  printf '  4. next build  &&  node scripts/stamp-git-sha.mjs        (NEXT_PUBLIC_SITE_URL required)\n'
  printf '  5. node scripts/precutover-check.mjs                     (32 checks)\n'
  printf '\n  the driver: node scripts/cutover-window.mjs %s %s\n' "${STEP_ARGS[*]}" "${PASSTHROUGH[*]:-}"
  printf '  human steps this does not do: Plesk → Node.js → Stop before the ETL; add DATABASE_URL +\n'
  printf '  DATABASE_DIRECT_URL, Restart App, then /api/v1/health and one real slip (runbook Phase 6).\n'
  exit 0
fi

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

say "Phase 6 sequence complete — all five steps passed"
printf '  evidence : %s\n' "$LOG"
printf '  next     : 1. read the gate output above (32/32)\n'
printf '             2. Plesk → Node.js → add DATABASE_URL + DATABASE_DIRECT_URL → Restart App\n'
printf '             3. /api/v1/health → database: ok, /api/v1/version → expected BUILD_ID\n'
printf '             4. one real order + slip end to end, then Phase 7: scripts/postswitch-check.mjs\n'
