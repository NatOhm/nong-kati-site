#!/bin/sh
# scripts/backup-mariadb.sh — nightly logical backup of the MariaDB database the shop runs on.
#
# Runs as a plain shell script on purpose: Plesk's scheduled tasks execute inside the vhost
# chroot, where there is no `node` (see docs/db-migration-hostatom-mariadb.md, Phase 8). It needs
# only `mariadb-dump`/`mysqldump`, `gzip`, `find` and `ls`.
#
# Guarantees
#   · a dump is written to a `.partial` file and only renamed after `gzip -t` passes, so a failed
#     or truncated dump never appears under a name that looks restorable;
#   · any dump/compression failure exits non-zero (a scheduled task that "succeeded" while
#     writing rubbish is worse than one that failed);
#   · pruning never deletes the newest surviving dump, and never the one just written.
#
# Configuration (environment):
#   DATABASE_URL     mysql://user:password@host:port/database   (password must be URL-safe,
#                    i.e. free of :/?#[]@ — use MYSQL_PWD instead if it is not)
#   or MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PWD / MYSQL_DATABASE
#   BACKUP_DIR       where the dumps go                (default: /var/backups/nong-kati)
#   PREFIX           file-name prefix                  (default: nong_kati)
#   RETENTION_COUNT  how many dumps to keep            (default: 14)
#   RETENTION_DAYS   also drop dumps older than N days (default: 0 = keep by count only)
#
# Usage
#   DATABASE_URL="mysql://user:pass@localhost:3306/nong_kati" \
#     BACKUP_DIR=/var/backups/nong-kati ./scripts/backup-mariadb.sh
#
# Exit: 0 dump written and pruned · 1 dump or verification failed · 2 configuration error.

set -eu

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() {
  printf '%s  ✖ %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

umask 077

# Plesk's scheduler does not pass secrets, and putting a password in the task command puts it
# in the panel (and in logs) forever. Point the task at a 0600 file instead.
if [ -n "${BACKUP_ENV_FILE:-}" ]; then
  [ -r "$BACKUP_ENV_FILE" ] || {
    printf '✖ BACKUP_ENV_FILE=%s is not readable\n' "$BACKUP_ENV_FILE" >&2
    exit 2
  }
  set -a
  # shellcheck disable=SC1090
  . "$BACKUP_ENV_FILE"
  set +a
fi

BACKUP_DIR=${BACKUP_DIR:-/var/backups/nong-kati}
PREFIX=${PREFIX:-nong_kati}
RETENTION_COUNT=${RETENTION_COUNT:-14}
RETENTION_DAYS=${RETENTION_DAYS:-0}

# ── connection ─────────────────────────────────────────────────────────────
if [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    mysql://*) ;;
    *) die "DATABASE_URL must start with mysql:// (got ${DATABASE_URL%%://*}://…)" ;;
  esac
  rest=${DATABASE_URL#mysql://}
  case "$rest" in
    *@*) ;;
    *) die "DATABASE_URL has no user@host part" ;;
  esac
  creds=${rest%%@*}
  tail_part=${rest#*@}
  case "$creds" in
    *:*) ;;
    *) die "DATABASE_URL has no password (user:password@host)" ;;
  esac
  MYSQL_USER=${creds%%:*}
  MYSQL_PWD=${creds#*:}
  host_port=${tail_part%%/*}
  case "$tail_part" in
    */*) db_part=${tail_part#*/} ;;
    *) die "DATABASE_URL has no database name" ;;
  esac
  MYSQL_DATABASE=${db_part%%\?*}
  case "$host_port" in
    *:*) MYSQL_HOST=${host_port%%:*}; MYSQL_PORT=${host_port##*:} ;;
    *) MYSQL_HOST=$host_port; MYSQL_PORT=3306 ;;
  esac
else
  : "${MYSQL_DATABASE:?MYSQL_DATABASE (or DATABASE_URL) is required}"
  MYSQL_HOST=${MYSQL_HOST:-localhost}
  MYSQL_PORT=${MYSQL_PORT:-3306}
  : "${MYSQL_USER:?MYSQL_USER (or DATABASE_URL) is required}"
  : "${MYSQL_PWD:?MYSQL_PWD (or DATABASE_URL) is required}"
fi
export MYSQL_PWD

# ── tool discovery ─────────────────────────────────────────────────────────
DUMP_BIN=''
for candidate in mariadb-dump mysqldump; do
  if command -v "$candidate" >/dev/null 2>&1; then
    DUMP_BIN=$candidate
    break
  fi
done
[ -n "$DUMP_BIN" ] || die "neither mariadb-dump nor mysqldump is on PATH"
command -v gzip >/dev/null 2>&1 || die "gzip is not on PATH"

mkdir -p "$BACKUP_DIR" || die "cannot create $BACKUP_DIR"
[ -w "$BACKUP_DIR" ] || die "$BACKUP_DIR is not writable"

STAMP=$(date -u '+%Y%m%d-%H%M%S')
NAME="${PREFIX}-${STAMP}.sql.gz"
FINAL="$BACKUP_DIR/$NAME"
PARTIAL="$BACKUP_DIR/.$NAME.partial"
SQL_TMP="$BACKUP_DIR/.$NAME.sql"

cleanup_partials() { rm -f "$PARTIAL" "$SQL_TMP"; }
trap cleanup_partials EXIT

log "dumping $MYSQL_DATABASE@$MYSQL_HOST:$MYSQL_PORT with $DUMP_BIN → $FINAL"

# --single-transaction: consistent snapshot without locking the shop's writes.
# --hex-blob: gift-code ciphertext/nonce/hash are VARBINARY — a text dump would mangle them.
# --routines --triggers: everything needed to rebuild, not just tables.
if ! "$DUMP_BIN" \
  --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" \
  --single-transaction --quick --skip-lock-tables \
  --default-character-set=utf8mb4 --hex-blob \
  --routines --triggers --no-tablespaces \
  --databases "$MYSQL_DATABASE" \
  > "$SQL_TMP" 2>"$BACKUP_DIR/.$NAME.err"; then
  err=$(tail -n 3 "$BACKUP_DIR/.$NAME.err" 2>/dev/null | tr '\n' ' ')
  rm -f "$BACKUP_DIR/.$NAME.err"
  die "dump failed: $err"
fi
rm -f "$BACKUP_DIR/.$NAME.err"

[ -s "$SQL_TMP" ] || die "dump produced an empty file"

if ! gzip -9 -c "$SQL_TMP" > "$PARTIAL"; then
  die "compression failed"
fi
if ! gzip -t "$PARTIAL" >/dev/null 2>&1; then
  die "the compressed dump does not pass gzip -t — refusing to publish it"
fi
rm -f "$SQL_TMP"
mv "$PARTIAL" "$FINAL" || die "cannot move the finished dump into place"

BYTES=$(wc -c < "$FINAL" | tr -d ' ')
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && sha256sum "$NAME" > "$NAME.sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && shasum -a 256 "$NAME" > "$NAME.sha256")
fi
log "wrote $NAME ($BYTES bytes)"

# ── retention ──────────────────────────────────────────────────────────────
# Newest first. The file just written is always index 1, so "keep the newest" is structural.
removed=0
set -- $(ls -1t "$BACKUP_DIR"/"$PREFIX"-*.sql.gz 2>/dev/null || true)
if [ "$#" -gt 0 ]; then
  index=0
  for file in "$@"; do
    index=$((index + 1))
    [ "$index" -le "$RETENTION_COUNT" ] && continue
    rm -f "$file" "$file.sha256" && removed=$((removed + 1))
  done
fi

if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  newest=$1
  for file in "$BACKUP_DIR"/"$PREFIX"-*.sql.gz; do
    [ -e "$file" ] || continue
    [ "$file" = "$newest" ] && continue          # never prune the newest surviving dump
    [ "$file" = "$FINAL" ] && continue           # never prune the one just written
    if [ -n "$(find "$file" -mtime +"$RETENTION_DAYS" 2>/dev/null)" ]; then
      rm -f "$file" "$file.sha256" && removed=$((removed + 1))
    fi
  done
fi

kept=$(ls -1 "$BACKUP_DIR"/"$PREFIX"-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
log "retention: kept $kept dump(s) (count=$RETENTION_COUNT, days=$RETENTION_DAYS), removed $removed"
[ "$kept" -ge 1 ] || die "retention removed every dump — refusing to exit success"
