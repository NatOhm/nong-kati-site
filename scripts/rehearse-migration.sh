#!/usr/bin/env bash
#
# Disposable-Postgres rehearsal for the pending Prisma migration.
#
# Why: vercel.json runs `prisma migrate deploy` during every deploy, so any
# migration in prisma/migrations/ reaches the production database as part of a
# push. This script executes the migrations against a throwaway container first
# and reports whether the data model and the migration history still agree.
#
# Usage:
#   bash scripts/rehearse-migration.sh              # full rehearsal
#   bash scripts/rehearse-migration.sh --dry-run    # print the plan, touch nothing
#   NK_PG_IMAGE=postgres:17-alpine bash scripts/... # match the deployment's PG major
#   NK_KEEP=1 bash scripts/...                      # leave the container for inspection
#   NK_RUN_TESTS=1 bash scripts/...                 # also run the vitest suite
#   NK_PG_PORT=55433 bash scripts/...               # if 55432 is taken
#
# Safety: the script exports its own DATABASE_URL pointed at 127.0.0.1 and
# refuses to start if an ambient DATABASE_URL looks non-local. It never reads
# .env / .env.local, so no project credential is loaded or printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Every tunable is NK_-prefixed on purpose: a bare PORT/KEEP in the ambient
# environment would otherwise silently retarget this script (it once inherited
# PORT=0 and would have published the container on port 0).
PG_IMAGE="${NK_PG_IMAGE:-postgres:16-alpine}"
PORT="${NK_PG_PORT:-55432}"
NAME="${NK_PG_NAME:-nk-rehearsal-pg}"
DB="${NK_PG_DB:-nk_rehearsal}"
KEEP="${NK_KEEP:-0}"
RUN_TESTS="${NK_RUN_TESTS:-0}"

PRISMA="node node_modules/prisma/build/index.js"
LOCAL_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}"
STAMP="$(date "+%Y%m%d-%H%M%S")"
REPORT_DIR="$ROOT/reports"
REPORT="$REPORT_DIR/migration-rehearsal-${STAMP}.txt"
FAILURES=0

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n=== %s ===\n' "$*" | tee -a "$REPORT"; }
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }

# ─── Guard 1: never touch a non-local database ───────────────────────────────
if [[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" != *127.0.0.1* && "$DATABASE_URL" != *localhost* ]]; then
  echo "ABORT: DATABASE_URL in this shell is not a local address; refusing to rehearse against it." >&2
  exit 1
fi

mkdir -p "$REPORT_DIR"
say "Migration rehearsal — $(date '+%Y-%m-%d %H:%M:%S')"
note "image=${PG_IMAGE}  port=${PORT}  db=${DB}"
note "pending migrations:"
note "$(ls -1 prisma/migrations | grep -v migration_lock.toml | tail -5)"

# ─── Guard 2: docker must actually be reachable ──────────────────────────────
ENGINE="$(docker info --format '{{.ServerVersion}}' 2>&1 | tail -1 || true)"

if [[ "$DRY_RUN" == "1" ]]; then
  say "Dry run — plan only"
  note "0. docker engine: ${ENGINE}"
  note "   tunables: NK_PG_IMAGE / NK_PG_PORT / NK_PG_NAME / NK_KEEP / NK_RUN_TESTS"
  note "1. docker run -d --name ${NAME} -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:${PORT}:5432 ${PG_IMAGE}"
  note "2. wait for readiness: docker exec ${NAME} pg_isready -U postgres"
  note "3. DATABASE_URL=${LOCAL_URL} ${PRISMA} migrate deploy"
  note "4. ${PRISMA} migrate diff --from-url ${LOCAL_URL} --to-schema-datamodel prisma/schema.prisma --script --exit-code   (expect 0)"
  note "5. ${PRISMA} generate"
  note "6. SQL assertions: new OrderItem columns, PromotionProduct table, RLS enabled, CHECK constraints, effective table grants"
  note "7. NK_RUN_TESTS=${RUN_TESTS} → vitest run"
  note "8. report: ${REPORT}"
  note "9. teardown: docker rm -f ${NAME} (skipped when NK_KEEP=1)"
  say "Dry run complete — nothing was started or changed."
  exit 0
fi

if [[ "$ENGINE" != [0-9]* ]]; then
  say "BLOCKED: docker engine is not reachable"
  note "$ENGINE"
  note ""
  note "Start Docker Desktop (or the com.docker.service) and re-run this script."
  note "If Docker is unavailable permanently, run the two commands by hand against any"
  note "disposable PostgreSQL: migrate deploy, then the migrate diff --from-url above."
  exit 1
fi
note "docker engine: ${ENGINE}"

cleanup() {
  if [[ "$KEEP" == "1" ]]; then
    echo "NK_KEEP=1 — leaving container ${NAME} running on 127.0.0.1:${PORT}" | tee -a "$REPORT"
  else
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ─── 1. Fresh container on a local, high port ────────────────────────────────
docker rm -f "$NAME" >/dev/null 2>&1 || true
say "Starting disposable PostgreSQL (${PG_IMAGE})"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres \
  -p "127.0.0.1:${PORT}:5432" "$PG_IMAGE" >/dev/null

say "Waiting for readiness"
READY=0
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
if [[ "$READY" != "1" ]]; then
  say "FAIL: container never became ready"
  docker logs "$NAME" 2>&1 | tail -20 | tee -a "$REPORT"
  exit 1
fi
note "ready after ${_:-?} polls"

# ─── 2. Apply the migration history to the throwaway database ────────────────
export DATABASE_URL="$LOCAL_URL"

say "1/5  prisma migrate deploy"
if $PRISMA migrate deploy 2>&1 | tee -a "$REPORT"; then
  note "RESULT: migrate deploy OK"
else
  note "RESULT: migrate deploy FAILED"
  FAILURES=$((FAILURES + 1))
fi

# ─── 3. Does the migration history still describe schema.prisma? ─────────────
say "2/5  schema/migration parity (migrate diff --from-url)"
# NOT --from-migrations: that replays the history into a shadow database, and
# 20260927200000_rls_baseline enables RLS on `_prisma_migrations`, a table the
# shadow database does not have — it fails with P1014 every time and would read
# as a migration problem. Comparing the database that `migrate deploy` just
# built against the data model answers the same question and needs no shadow.
set +e
DIFF_OUT="$($PRISMA migrate diff \
  --from-url "$LOCAL_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --exit-code 2>&1)"
DIFF_STATUS=$?
set -e
printf '%s\n' "$DIFF_OUT" >>"$REPORT"
if [[ "$DIFF_STATUS" == "0" ]]; then
  note "RESULT: no drift — migrations and schema.prisma agree"
else
  note "RESULT: DRIFT DETECTED (migrate diff exit ${DIFF_STATUS})"
  note "The statements above are what it would take to make the migrated database match"
  note "schema.prisma. Anything here means a future 'migrate dev' would rewrite it."
  FAILURES=$((FAILURES + 1))
fi

# ─── 4. Regenerate the client from the migrated database's schema ────────────
say "3/5  prisma generate"
if $PRISMA generate 2>&1 | tail -3 | tee -a "$REPORT"; then
  note "RESULT: generate OK"
else
  note "RESULT: generate FAILED"
  FAILURES=$((FAILURES + 1))
fi

# ─── 5. Assert the migration's own promises ──────────────────────────────────
say "4/5  post-migration assertions"
q() { docker exec "$NAME" psql -U postgres -d "$DB" -tAc "$1"; }
check() { # label, sql, expected
  local got
  got="$(q "$2" 2>&1 | tr -d '[:space:]')"
  if [[ "$got" == "$3" ]]; then
    note "PASS  $1  (=$got)"
  else
    note "FAIL  $1  expected $3, got ${got:-<empty>}"
    FAILURES=$((FAILURES + 1))
  fi
}

check "4 new OrderItem snapshot columns exist" \
  "SELECT count(*) FROM information_schema.columns WHERE table_name='OrderItem' AND column_name IN ('couponDiscountThb','finalLineTotalThb','finalLineExVat','finalLineVatAmount')" "4"
check "PromotionProduct table exists" \
  "SELECT count(*) FROM information_schema.tables WHERE table_name='PromotionProduct'" "1"
check "RLS enabled on Promotion + PromotionProduct" \
  "SELECT count(*) FROM pg_class WHERE relname IN ('Promotion','PromotionProduct') AND relrowsecurity" "2"
check "OrderItem CHECK constraints applied (>=6)" \
  "SELECT count(*) >= 6 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='OrderItem' AND c.contype='c'" "t"
# 26 scalar fields in the OrderItem model (0 @map overrides) — a floor, not an
# equality, so a leftover column from history is not reported as a failure.
check "OrderItem has at least the model's 26 columns" \
  "SELECT count(*) >= 26 FROM information_schema.columns WHERE table_name='OrderItem'" "t"

# Same rule as the migration's own pre-flight guard and scripts/verify-rls.cjs:
# deny-by-default RLS is only safe because the connecting role owns the tables.
# When it does not, reads silently return zero rows instead of failing.
check "connecting role bypasses RLS on the two new tables" \
  "SELECT count(*) = 0 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_roles o ON o.oid = c.relowner WHERE n.nspname = 'public' AND c.relname IN ('Promotion','PromotionProduct') AND o.rolname IS DISTINCT FROM current_user AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls))" "t"

note ""
note "Effective grants on the two RLS-enabled tables (review: the app role must still read/write):"
q "SELECT grantee||' '||privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('Promotion','PromotionProduct') ORDER BY 1" | sed 's/^/  /' | tee -a "$REPORT"

note ""
note "RLS policies present:"
q "SELECT tablename||': '||policyname FROM pg_policies WHERE tablename IN ('Promotion','PromotionProduct') ORDER BY 1" | sed 's/^/  /' | tee -a "$REPORT"

note ""
note "Promotion columns (the migration adds 'productIds'; schema.prisma no longer declares it):"
q "SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns WHERE table_name='Promotion'" | sed 's/^/  /' | tee -a "$REPORT"

# ─── 6. Optional suite ───────────────────────────────────────────────────────
if [[ "$RUN_TESTS" == "1" ]]; then
  say "5/5  vitest run"
  if node node_modules/vitest/vitest.mjs run 2>&1 | tail -12 | tee -a "$REPORT"; then
    note "RESULT: suite OK"
  else
    note "RESULT: suite FAILED"
    FAILURES=$((FAILURES + 1))
  fi
else
  say "5/5  vitest run — skipped (NK_RUN_TESTS=0)"
fi

# ─── Verdict ─────────────────────────────────────────────────────────────────
say "Rehearsal verdict"
if [[ "$FAILURES" == "0" ]]; then
  note "PASS — migrate deploy applied cleanly, schema and migrations agree, assertions held."
  note "Evidence: ${REPORT}"
  exit 0
fi
note "FAIL — ${FAILURES} check(s) failed. Read the sections above before deploying."
note "Evidence: ${REPORT}"
exit 1
