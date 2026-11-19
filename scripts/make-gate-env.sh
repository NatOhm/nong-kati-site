#!/usr/bin/env bash
# ─── Nong-Kati — make-gate-env.sh ────────────────────────────────────────────
# Build the post-switch gate's credential file without any value ever touching
# the transcript, a command line, shell history or the tracked tree.
#
#   bash scripts/make-gate-env.sh
#
# Asks for the shop's database URL and the JWT secret with the terminal echo off
# (`read -s`), writes them as TARGET_DATABASE_URL + NK_JWT_SECRET into
#
#   tmp/nk6/gate.env        (mode 0600, under the ignored tmp/ tree)
#
# and prints only the parsed shape: user, host, port, database name and the
# character length of each value. No value is ever echoed back.
#
# scripts/lib/certify.sh sources that exact path when TARGET_DATABASE_URL is
# unset, so scripts/deploy-manual.sh and scripts/deploy-full.sh find it by
# themselves. Nothing inside the checkout is a designated holder for the
# credential: `tmp/` is gitignored (.gitignore:23) and this script refuses a
# path git does not ignore, or one git already tracks.
#
# Env overrides (non-interactive use — still never echoed, still never on argv):
#   GATE_ENV   path to write (default tmp/nk6/gate.env)
#   GATE_URL   TARGET_DATABASE_URL, skips its prompt
#   GATE_JWT   NK_JWT_SECRET, skips its prompt
#
# Exits 1 (or 2 from `read`) without writing anything if a value is missing,
# unparseable, or a target the gate would refuse anyway.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
[ -f package.json ] && [ -f server.js ] || { printf '✖ run me from the app root.\n' >&2; exit 1; }

TARGET="${GATE_ENV:-tmp/nk6/gate.env}"
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. The file must sit outside the tracked tree ────────────────────────────
git rev-parse --git-dir >/dev/null 2>&1 \
  || die "not a git checkout — refusing to guess where a credential should live."
if git ls-files --error-unmatch "$TARGET" >/dev/null 2>&1; then
  die "$TARGET is tracked by git — use a path under tmp/ (gitignored)."
fi
git check-ignore -q "$TARGET" \
  || die "$TARGET is NOT gitignored — refusing to write a credential there."

# ── 1. The target database ───────────────────────────────────────────────────
if [ -z "${GATE_URL:-}" ]; then
  say "Post-switch gate credentials → $TARGET (0600, gitignored, outside the tree)"
  cat <<'GUIDE'
  What you paste is not echoed, not stored in shell history, and never becomes a
  command-line argument: it goes from the hidden prompt into the file. Ctrl-C
  aborts with nothing written.

  Paste the Plesk Secret `DATABASE_URL` (identical to `DATABASE_DIRECT_URL`):

    mysql://nongka_nongkati_nongkatistore:<password>@thsv93.hostatom.com:3306/nongka_nongkati_nongkatistore?connection_limit=5

  • host: the shop's MariaDB user is `@'localhost'` and Plesk's "Allow remote
    access" is UNCHECKED, so `thsv93.hostatom.com:3306` refuses this workstation
    however right the password is. Forward it first (`ssh -N -L
    3307:localhost:3306 nongka@thsv93.hostatom.com`) and use `127.0.0.1:3307`;
    plain `localhost` resolves only inside the vhost.
  • password: percent-encode anything outside [A-Za-z0-9]
      @ → %40    : → %3A    # → %23    % → %25    & → %26    ? → %3F    / → %2F
  • keep `?connection_limit=5`
GUIDE
  printf '\n  TARGET_DATABASE_URL (hidden): ' >&2
  IFS= read -rs GATE_URL || die "no input — nothing was written."
  printf '\n' >&2
fi

case "${GATE_URL:-}" in
  '')        die "empty value — nothing was written." ;;
  mysql://*) ;;
  *)         die "not a mysql:// URL — nothing was written." ;;
esac

REST="${GATE_URL#mysql://}"
USERINFO="${REST%%@*}"
HOSTPART="${REST#*@}"
case "$HOSTPART" in
  *@*) die "the password looks like it contains a raw '@' — replace it with %40 and re-run." ;;
esac
DBUSER="${USERINFO%%:*}"
DBPASS="${USERINFO#*:}"
[ "$DBPASS" != "$USERINFO" ] || die "expected mysql://user:password@host:port/database"

HOSTPORT="${HOSTPART%%/*}"
DBPATH="${HOSTPART#*/}"
DBHOST="${HOSTPORT%%:*}"
DBPORT="${HOSTPORT#*:}"
if [ "$DBPORT" = "$HOSTPORT" ]; then DBPORT="(absent → 3306)"; fi
DBNAME="${DBPATH%%\?*}"

[ -n "$DBUSER" ] || die "no user parsed — nothing was written."
[ -n "$DBHOST" ] || die "no host parsed — nothing was written."
[ -n "$DBNAME" ] || die "no database name parsed — nothing was written."
case "$DBHOST" in
  localhost)
    warn "host is localhost — that only resolves inside the vhost. With the forward open, use 127.0.0.1:3307." ;;
  127.0.0.1)
    case "$DBPORT" in
      3307) ;;
      *) warn "127.0.0.1:$DBPORT — the documented forward lands on 3307: ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com" ;;
    esac ;;
  *hostatom.com)
    warn "the MariaDB user is @'localhost' with remote access OFF — $DBHOST:$DBPORT refuses this workstation however right the password is. Use the SSH forward and 127.0.0.1:3307." ;;
  *supabase*|*pooler*)
    die "scripts/postswitch-check.mjs refuses a Supabase/pooler target on purpose." ;;
esac
case "$DBPASS" in
  *[[:space:]]*) die "the password contains whitespace — re-copy it." ;;
esac
if printf '%s' "$DBPASS" | sed 's/%[0-9A-Fa-f][0-9A-Fa-f]//g' | grep -q '%'; then
  warn "the password has a '%' that is not followed by two hex digits — check the encoding."
fi

# ── 2. The JWT secret ────────────────────────────────────────────────────────
if [ -z "${GATE_JWT:-}" ]; then
  printf '  NK_JWT_SECRET (hidden, ≥32 chars): ' >&2
  IFS= read -rs GATE_JWT || die "no input — nothing was written."
  printf '\n' >&2
fi
[ "${#GATE_JWT}" -ge 32 ] \
  || die "NK_JWT_SECRET is ${#GATE_JWT} characters — the gate needs at least 32. Nothing was written."
case "$GATE_JWT" in
  *[[:space:]]*) die "NK_JWT_SECRET contains whitespace — re-copy it." ;;
esac

# ── 3. Write it 0600, atomically ─────────────────────────────────────────────
mkdir -p "$(dirname "$TARGET")"
OUT="$(mktemp "${TARGET}.XXXXXX")"
trap 'rm -f "$OUT"' EXIT
printf 'TARGET_DATABASE_URL=%s\nNK_JWT_SECRET=%s\n' "$GATE_URL" "$GATE_JWT" > "$OUT"
chmod 600 "$OUT" 2>/dev/null || true
mv -f "$OUT" "$TARGET"
trap - EXIT
chmod 600 "$TARGET" 2>/dev/null || true

# NTFS carries no POSIX modes: Git Bash reports 644 whatever chmod does, so the
# 0600 guarantee is enforced as an ACL granting only the owner. If that cannot be
# arranged, the file is deleted rather than left readable.
MODE_NOTE="$(stat -c '%a' "$TARGET" 2>/dev/null || printf '?')"
case "$(uname -s 2>/dev/null || printf 'unknown')" in
  MSYS*|MINGW*|CYGWIN*)
    WIN_PATH="$(cygpath -w "$TARGET" 2>/dev/null || printf '%s' "$TARGET")"
    if command -v icacls >/dev/null 2>&1 \
       && icacls "$WIN_PATH" /inheritance:r >/dev/null 2>&1 \
       && icacls "$WIN_PATH" /grant:r "${USERNAME:-$USER}:F" >/dev/null 2>&1; then
      MODE_NOTE="owner-only ACL (${USERNAME:-$USER}), NTFS reports $MODE_NOTE to the POSIX shim"
    else
      rm -f "$TARGET"
      die "could not restrict $TARGET to your user — deleted it rather than leave it readable."
    fi
    ;;
esac

say "Wrote $TARGET — no value was echoed, logged or put on a command line"
cat <<SHAPE
  file        : $TARGET  (mode $MODE_NOTE, gitignored)
  TARGET_DATABASE_URL
    user      : $DBUSER
    host      : $DBHOST
    port      : $DBPORT
    database  : $DBNAME
    length    : ${#GATE_URL} chars
  NK_JWT_SECRET
    length    : ${#GATE_JWT} chars
SHAPE

warn "scripts/postswitch-check.mjs prefers .env.local / .env over the environment."
printf '  This tree'\''s .env.local holds a 64-char NK_JWT_SECRET; if that is not the value\n'
printf '  you just wrote, the gate mints its admin token with the STALE one. A gate\n'
printf '  failure at `admin login` starts there, not in the Plesk panel.\n'

printf '  The deploy proves this route with a read-only SELECT 1 before it publishes anything:\n'
printf '  with the forward closed it refuses with exit 2 and names the unreachable route.\n'

say "Next, once the panel's Run Now has served the new build"
printf '  bash scripts/deploy-full.sh --postswitch-only\n\n'

unset GATE_URL GATE_JWT DBPASS
