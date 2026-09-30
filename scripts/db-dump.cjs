/**
 * scripts/db-dump.cjs — full pg_dump of the Supabase database (pre-cutover backup).
 *
 * Produces a single restore-capable archive: schema + data + constraints +
 * indexes + RLS policies + _prisma_migrations. This is the only backup that
 * can rebuild the database from zero; the JSON backups (backup-customers /
 * backup-shop) are the quick-reference copies.
 *
 * Behaviour:
 *   • Reads DATABASE_DIRECT_URL (preferred) or DATABASE_URL from .env/.env.local —
 *     never printed, never passed through a shell (spawn with argv array).
 *   • If only the pgbouncer pooler URL (:6543 / pgbouncer=true) is found, it
 *     rewrites to the session-mode :5432 endpoint and warns (pg_dump needs a
 *     real session; transaction-pooling breaks COPY).
 *   • Dumps the `public` schema (all app tables + _prisma_migrations live
 *     there). Set DUMP_ALL_SCHEMAS=1 to include everything in the database.
 *   • Verifies the archive afterwards with `pg_restore --list` when available.
 *
 * Usage:
 *   node scripts/db-dump.cjs           # dump to backups/db-<timestamp>.dump
 *   node scripts/db-dump.cjs --check   # validate config only, no dump
 *
 * If pg_dump is not installed the script prints exact install options and
 * exits non-zero without touching anything.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CHECK_ONLY = process.argv.includes('--check');
const outDir = path.join(__dirname, '..', 'backups');

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(2);
}

// ── Load connection URLs from env files (never printed in full) ──────────
function loadEnvUrl(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n#]+)"?`));
      if (m) return m[1].trim();
    }
  }
  return null;
}

// ── Choose the safest URL for pg_dump ────────────────────────────────────
let rawUrl = loadEnvUrl('DATABASE_DIRECT_URL') || loadEnvUrl('DATABASE_URL');
if (!rawUrl) die('DATABASE_URL not found (looked in env, .env.local, .env)');

let usedPooler = false;
if (/(:6543|pgbouncer=true)/.test(rawUrl)) {
  // Session-mode endpoint for a dump the transaction pooler can't serve.
  usedPooler = true;
  rawUrl = rawUrl.replace(/:6543/, ':5432').replace(/([?&])pgbouncer=true&?/, '$1').replace(/[?&]$/, '');
}

// Masked display: host:port/db only — no user, no password.
let display = '(unparsable url)';
try {
  const u = new URL(rawUrl);
  display = `${u.hostname}:${u.port || 5432}${u.pathname}`;
} catch { /* keep fallback */ }

console.log(`target db:      ${display}`);
console.log(`schema filter:  ${process.env.DUMP_ALL_SCHEMAS ? 'ALL schemas' : 'public only (override: DUMP_ALL_SCHEMAS=1)'}`);
if (usedPooler) console.log('⚠ pooler URL detected — rewrote to session-mode :5432 for the dump.');

// ── Locate pg_dump / pg_restore ──────────────────────────────────────────
function findTool(tool) {
  const probe = spawnSync(tool, ['--version'], { encoding: 'utf8', shell: false });
  if (probe.status === 0) return tool;
  // Common Windows install location (any minor version).
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    try {
      for (const ver of fs.readdirSync(base)) {
        const exe = path.join(base, ver, 'bin', `${tool}.exe`);
        if (fs.existsSync(exe) && spawnSync(exe, ['--version'], { encoding: 'utf8' }).status === 0) return exe;
      }
    } catch { /* not installed there */ }
  }
  return null;
}

const pgDump = findTool('pg_dump');
const pgRestore = findTool('pg_restore');

if (!pgDump) {
  console.error(`
✖ pg_dump not found on this machine.

  Install ONE of these (no project changes needed), then re-run:
    1. winget install PostgreSQL.PostgreSQL.17        (adds pg_dump to PATH after shell restart)
    2. Download "PostgreSQL Binaries" from enterprisedb.com and add bin/ to PATH
    3. Supabase Dashboard → Database → Backups → Download backup   (no install at all)

  This script cannot download binaries for you.`);
  process.exit(2);
}
console.log(`pg_dump:        ${pgDump}`);

// ── Dump ─────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(outDir, `db-${stamp}.dump`);

const args = [
  '--no-owner',            // rows won't be owned by the supabase admin user after restore
  '--no-privileges',       // skip grant/revoke noise tied to supabase roles
  '--format=custom',       // compressed, selectively restorable via pg_restore
  '--file', outFile,
];
if (!process.env.DUMP_ALL_SCHEMAS) args.push('--schema', 'public');
args.push(rawUrl);

if (CHECK_ONLY) {
  console.log('check only — would run:');
  console.log(`  pg_dump ${args.slice(0, -1).join(' ')} "<redacted-url>"`);
  console.log('✔ config valid');
  process.exit(0);
}

console.log(`dumping → backups/${path.basename(outFile)} …`);
const res = spawnSync(pgDump, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
if (res.status !== 0) {
  die(`pg_dump failed:\n${res.stderr || '(no stderr)'}`);
}

const size = fs.statSync(outFile).size;
if (size < 10_000) die(`dump suspiciously small (${size} bytes) — investigate before relying on it`);

// ── Verify archive readability ───────────────────────────────────────────
if (pgRestore) {
  const v = spawnSync(pgRestore, ['--list', outFile], { encoding: 'utf8' });
  if (v.status === 0) {
    const tables = (v.stdout.match(/TABLE DATA/g) || []).length;
    console.log(`✔ archive verified: readable, ${tables} table data section(s)`);
  } else {
    console.error('⚠ pg_restore --list failed — archive may be corrupt');
  }
} else {
  console.log('⚠ pg_restore not found — skipping archive verification (dump itself succeeded)');
}

console.log(`
✔ dump complete: backups/${path.basename(outFile)} (${(size / 1024 / 1024).toFixed(1)} MB)

RESTORE (only if disaster strikes — into a fresh Supabase project or local Postgres):
  pg_restore --no-owner --no-privileges --jobs=4 \\
    --dbname="postgresql://postgres:<password>@<host>:5432/postgres" \\
    backups/${path.basename(outFile)}

  Then: npx prisma generate   (client is code, not data)
        node scripts/verify-rls.cjs --url "<restored-url>"   (re-check RLS baseline)

Keep a copy of this file OFF this machine before the Hostatom cutover.`);
