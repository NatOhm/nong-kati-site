#!/usr/bin/env bash
# ─── Nong-Kati — rehearse-phase6.sh ─────────────────────────────────────────
# Phase 6's whole value is its ORDER: a migrated schema before the ETL, the ETL
# before the images, the images before the build, the build before the gate. Get
# that wrong and every step still prints ✔ while proving nothing — which is not
# something you want to discover at 02:30 inside the cutover window.
#
# This wrapper rehearses the driver itself against the LOCAL MariaDB copy
# (nk-mariadb, 127.0.0.1:3307) and asserts the order from the driver's own log,
# so a reordered or silently-trimmed sequence fails here instead of in the window.
#
# It runs four cases against `scripts/archive-postgres/phase6-cutover.sh` — the real entry point,
# not a re-implementation:
#
#   1. plan             --dry-run                        assert the full order
#   2. plan-trimmed     --dry-run --skip-etl --skip-images
#                                                        assert the trim keeps order
#   3. live-gate        --from=check                     really runs the 32-check gate
#                                                        against the copy and passes
#   4. first-failure    --from=schema to an unreachable server (closed port)
#                                                        assert it stops AT schema and
#                                                        never starts the ETL. A missing
#                                                        database name would not do: Prisma
#                                                        creates it and the ETL would run.
#
# Nothing here writes to Supabase, and the only database it touches is the local
# copy in NK_REHEARSAL_TARGET. Case 3 is the documented, repeatable gate: it
# derives its fixtures from the copy, restores the inventory and deletes its own
# rows (docs/db-migration-hostatom-mariadb.md, "Pre-cutover check").
#
# Usage
#   bash scripts/archive-postgres/rehearse-phase6.sh                  # all four cases
#   bash scripts/archive-postgres/rehearse-phase6.sh --plan-only      # cases 1–2, no database needed
#   bash scripts/archive-postgres/rehearse-phase6.sh --dry-run        # print what would run
#   bash scripts/archive-postgres/rehearse-phase6.sh --allow-dirty    # pass the driver's dirty-tree
#                                                    # guard through (not advised)
#   NK_REHEARSAL_TARGET="mysql://root:ci@127.0.0.1:3307/ci" bash scripts/…
#
# Env
#   NK_REHEARSAL_TARGET   default mysql://root:ci@127.0.0.1:3307/ci (the copy)
#   NK_REHEARSAL_DIR      where the per-case logs land (default reports/)
#
# Exit: 0 every case passed · 1 an assertion failed · 2 preflight refused to run.
# Logs: reports/phase6-rehearsal-<stamp>-<case>.log (gitignored via *.log)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;36m▶ %b\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✔\033[0m %b\n' "$*"; }
bad()  { printf '  \033[1;31m✖\033[0m %b\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %b\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %b\033[0m\n' "$*" >&2; exit 2; }

TARGET="${NK_REHEARSAL_TARGET:-mysql://root:ci@127.0.0.1:3307/ci}"
LOG_DIR="${NK_REHEARSAL_DIR:-reports}"
PLAN_ONLY=0
DRY_RUN=0
PASSTHROUGH=()

for arg in "$@"; do
  case "$arg" in
    --plan-only)   PLAN_ONLY=1 ;;
    --dry-run)     DRY_RUN=1 ;;
    --allow-dirty) PASSTHROUGH+=(--allow-dirty) ;;
    -h|--help)     awk 'NR>2 && /^# ─/{exit} NR>2{sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)             die "unknown argument: $arg (try --help)" ;;
  esac
done

DRIVER="scripts/archive-postgres/phase6-cutover.sh"
[ -f "$DRIVER" ] || die "$DRIVER is missing — it is the entry point this rehearses."
[ -d node_modules ] || die "node_modules is missing — run 'npm ci' first."
command -v node >/dev/null 2>&1 || die "node is not on PATH."

# ── Preflight: the target must be the local copy, never anything else ───────
case "$TARGET" in
  mysql://*|mysqls://*) : ;;
  *) die "NK_REHEARSAL_TARGET must be a mysql:// URL — got ${TARGET%%://*}://… ." ;;
esac
case "$TARGET" in
  *@127.0.0.1:*|*@localhost:*) : ;;
  *) die "NK_REHEARSAL_TARGET must point at loopback (the local MariaDB copy), not ${TARGET#*@}." ;;
esac

if [ "$PLAN_ONLY" = "0" ]; then
  # Liveness only: if the container is down, case 3 would fail with a confusing
  # Prisma error instead of "start the copy".
  if command -v docker >/dev/null 2>&1; then
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'nk-mariadb'; then
      die "the local MariaDB copy (container nk-mariadb, 127.0.0.1:3307) is not running:
  docker run --rm -d --name nk-mariadb -e MARIADB_ROOT_PASSWORD=ci \\
    -e MARIADB_DATABASE=ci -p 3307:3306 mariadb:10.11
  then re-run with --plan-only to rehearse the order without a database."
    fi
  else
    warn "docker is not on PATH — skipping the container check; case 3 will prove connectivity itself."
  fi
fi

STAMP="$(date '+%Y%m%d-%H%M%S')"
mkdir -p "$LOG_DIR"
PASSED=0
FAILED=0
SUMMARY=()

# case_log <name> — path for a case's captured output
case_log() { printf '%s/phase6-rehearsal-%s-%s.log' "$LOG_DIR" "$STAMP" "$1"; }

# run_case <name> <driver args…>
# Runs the driver, tees its output, and returns its exit status so the caller can
# assert on the log. `set -e` must not kill the wrapper on an expected failure.
run_case() {
  local name="$1"; shift 1
  local log; log="$(case_log "$name")"
  local status
  set +e
  TARGET_DATABASE_URL="$TARGET" bash "$DRIVER" "$@" 2>&1 | tee "$log"
  status="${PIPESTATUS[0]}"
  set -e
  CASE_LOG="$log"
  CASE_STATUS="$status"
}

# ── assertions ─────────────────────────────────────────────────────────────
# present <text> <what>       the log must contain this literal somewhere
# order <text…>               those literals must appear in this order, each
#                             one after the previous match
# absent <text> <what>        the log must not contain this literal at all
assert_fail=0
present() {
  if grep -qF -- "$1" "$CASE_LOG"; then ok "$2"; else bad "$2 — '$1' is missing from $CASE_LOG"; assert_fail=1; fi
}
absent() {
  if grep -qF -- "$1" "$CASE_LOG"; then bad "$2 — '$1' ran, but the sequence should not have reached it"; assert_fail=1; else ok "$2"; fi
}
order() {
  local from=1 text line
  for text in "$@"; do
    line="$(awk -v s="$from" -v pat="$text" 'NR>=s && index($0, pat) { print NR; exit }' "$CASE_LOG")"
    if [ -z "$line" ]; then
      bad "order broken: '$text' never appears after line $from"
      assert_fail=1
      return 1
    fi
    from=$((line + 1))
  done
  ok "order held: $*"
}
assert_exit() {
  if [ "$CASE_STATUS" = "$1" ]; then
    ok "exit $1 as expected"
  else
    bad "expected exit $1, got $CASE_STATUS — see $CASE_LOG"
    assert_fail=1
  fi
}
assert_nonzero_exit() {
  if [ "$CASE_STATUS" != "0" ]; then ok "exit $CASE_STATUS (non-zero, as expected)"; else
    bad "expected a non-zero exit, got 0 — the failure never happened, see $CASE_LOG"; assert_fail=1
  fi
}
finish_case() {
  if [ "$assert_fail" = "0" ]; then PASSED=$((PASSED + 1)); SUMMARY+=("PASS  $1"); else FAILED=$((FAILED + 1)); SUMMARY+=("FAIL  $1  ($CASE_LOG)"); fi
  assert_fail=0
}

if [ "$DRY_RUN" = "1" ]; then
  say "Rehearsal plan — nothing executed"
  printf '  target  : %s\n' "$(printf '%s' "$TARGET" | sed -E 's#//[^@]*@#//***@#')"
  printf '  driver  : %s\n' "$DRIVER"
  printf '  logs    : %s/phase6-rehearsal-%s-*.log\n' "$LOG_DIR" "$STAMP"
  printf '  cases   : 1 plan · 2 plan-trimmed%s\n' "$([ "$PLAN_ONLY" = "1" ] && echo '' || echo ' · 3 live-gate · 4 first-failure')"
  printf '\n  1. --dry-run                       assert schema → etl → images → build → gate\n'
  printf '  2. --dry-run --skip-etl --skip-images  assert the trim keeps the remaining order\n'
  if [ "$PLAN_ONLY" = "0" ]; then
    printf '  3. --from=check                     the 32-check gate, for real, against the copy\n'
    printf '  4. --from=schema to nk_p6_absent     assert it stops at schema and never starts the ETL\n'
  fi
  exit 0
fi

# ── Case 1: the plan, in full ──────────────────────────────────────────────
say "1/4 plan — the full sequence, order only"
run_case plan --dry-run
assert_exit 0
present "Dry run — plan only, nothing is executed" "dry run announced"
# The wrapper's own banner must agree with the driver's plan; this is the line a
# human reads in the window, so a reordering here is the failure that matters.
present "steps  : migrate deploy · ETL · image extraction · build · gate" "banner lists the five steps in order"
order \
  "1. prisma migrate deploy" \
  "2. node scripts/archive-postgres/migrate-supabase-to-mariadb.mjs" \
  "3. node scripts/extract-images-to-files.mjs --apply" \
  "4. next build" \
  "5. node scripts/archive-postgres/precutover-check.mjs"
finish_case "plan"

# ── Case 2: flags trim the plan without reordering it ─────────────────────
say "2/4 plan-trimmed — --skip-etl --skip-images must not move the survivors"
run_case plan-trimmed --dry-run --skip-etl --skip-images
assert_exit 0
present "steps  : migrate deploy · build · gate" "banner keeps only the enabled steps"
present "skipped: etl images" "banner names what it dropped"
absent "2. node scripts/archive-postgres/migrate-supabase-to-mariadb.mjs" "ETL plan line is gone"
present "(skipped by --skip-etl)" "the plan says the ETL is skipped instead of hiding it"
absent "3. node scripts/extract-images-to-files.mjs --apply" "image plan line is gone"
order "1. prisma migrate deploy" "4. next build" "5. node scripts/archive-postgres/precutover-check.mjs"
finish_case "plan-trimmed"

if [ "$PLAN_ONLY" = "1" ]; then
  printf '\n'
  say "Plan-only rehearsal finished (cases 3–4 need the local MariaDB copy)"
else
  # ── Case 3: the gate, for real, against the copy ────────────────────────
  say "3/4 live-gate — --from=check against the copy"
  run_case live-gate --from=check
  assert_exit 0
  present "▶ run the 32-check cutover gate" "the gate started"
  present "✔ run the 32-check cutover gate" "the gate finished"
  present "checks passed" "the gate reported its checks"
  absent "▶ apply the baseline migration to the target" "--from=check did not re-run the schema"
  absent "▶ copy every row from the source into the target" "--from=check did not start the ETL"
  order "▶ run the 32-check cutover gate" "✔ run the 32-check cutover gate"
  finish_case "live-gate"

  # ── Case 4: a failure stops at its step and takes nothing with it ───────
  say "4/4 first-failure — an unreachable target must stop at schema, not scrape past it"
  # Deliberately a closed port, not a missing database name: `prisma migrate deploy`
  # CREATES a MySQL database that does not exist (measured 2026-11-15 — it printed
  # "MySQL database nk_p6_absent created"), so a mistyped name rehearses nothing and
  # would have run the ETL for real. An unreachable server cannot be created.
  DEAD_PORT="${NK_P6_DEAD_PORT:-3399}"
  AUTH="$(printf '%s' "$TARGET" | sed -E 's#^mysqls?://([^@]*)@.*#\1#')"
  BROKEN_TARGET="mysql://${AUTH}@127.0.0.1:${DEAD_PORT}/nk_p6_absent"
  if netstat -ano 2>/dev/null | grep -q ":${DEAD_PORT} .*LISTENING"; then
    bad "port ${DEAD_PORT} is listening — the failure case needs a closed port (set NK_P6_DEAD_PORT)"
    FAILED=$((FAILED + 1)); SUMMARY+=("FAIL  first-failure  (port ${DEAD_PORT} is in use)")
  elif [ "$AUTH" = "$TARGET" ]; then
    bad "could not take credentials out of $TARGET to build the failure target"
    FAILED=$((FAILED + 1)); SUMMARY+=("FAIL  first-failure  (no throwaway target)")
  else
    # This case needs a different target, so it drives the wrapper directly
    # instead of going through run_case (which pins TARGET_DATABASE_URL).
    CASE_LOG="$(case_log first-failure)"
    set +e
    TARGET_DATABASE_URL="$BROKEN_TARGET" bash "$DRIVER" --from=schema --skip-check 2>&1 | tee "$CASE_LOG" >/dev/null
    CASE_STATUS="${PIPESTATUS[0]}"
    set -e
    assert_nonzero_exit
    present "▶ apply the baseline migration to the target" "it reached the schema step"
    present "failed" "the driver named the failing step"
    absent "✔ apply the baseline migration to the target" "it did not claim the schema succeeded"
    absent "copy every row from the source into the target" "it never started the ETL after the schema failed"
    finish_case "first-failure"
  fi
fi

# ── summary ───────────────────────────────────────────────────────────────
printf '\n'
say "Phase 6 rehearsal — $PASSED passed, $FAILED failed"
for row in "${SUMMARY[@]}"; do printf '  %s\n' "$row"; done
if [ "$FAILED" != "0" ]; then
  printf '\n\033[1;31m✖ the Phase 6 driver no longer proves its own order — fix that before the window.\033[0m\n'
  exit 1
fi
printf '\n\033[1;32m✔ the driver runs its steps in the documented order and stops at the first failure.\033[0m\n'
printf '  logs: %s/phase6-rehearsal-%s-*.log\n' "$LOG_DIR" "$STAMP"
