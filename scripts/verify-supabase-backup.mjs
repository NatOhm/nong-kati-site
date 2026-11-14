#!/usr/bin/env node
/**
 * scripts/verify-supabase-backup.mjs — restore rehearsal for a `db-full-*.dump` artifact.
 *
 * A backup nobody has restored is a hope. This script restores the artifact into a throwaway
 * Postgres 17 database (a container that is deleted afterwards, so no scratch state is left
 * lying around), then recomputes the same per-table row count and ordered row-hash
 * fingerprint that `backup-supabase-db.mjs` recorded from the source, and compares them.
 *
 * Usage
 *   node scripts/verify-supabase-backup.mjs                          # newest db-full-*.dump
 *   node scripts/verify-supabase-backup.mjs --dump=backups/db-full-2026-11-15T02-10-00.dump
 *   node scripts/verify-supabase-backup.mjs --keep                   # leave the container up
 *
 * Exit codes: 0 every populated table matched · 1 a mismatch or a populated table did not
 * come back · 2 usage/setup problem.
 *
 * What "match" means: identical row count and identical `md5(string_agg(md5(row::text),
 * '' ORDER BY md5(row::text)))`. The hash covers every column of every row, so a value that
 * changed by a byte — a truncated string, a float that lost precision, a timestamp shifted a
 * millisecond — changes the hash. Ordering by row hash keeps it independent of physical order.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BACKUPS = path.join(ROOT, 'backups');
const TMP = path.join(ROOT, 'tmp');
const PG_IMAGE = 'postgres:17-alpine';
const PORT = 5544;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const keep = process.argv.includes('--keep');

function newestDump() {
  if (!fs.existsSync(BACKUPS)) return null;
  const candidates = fs
    .readdirSync(BACKUPS)
    .filter((f) => /^db-full-.*\.dump$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(BACKUPS, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length > 0 ? path.join(BACKUPS, candidates[0].f) : null;
}

const dumpPath = arg('dump') ? path.resolve(ROOT, arg('dump')) : newestDump();
if (!dumpPath || !fs.existsSync(dumpPath)) {
  console.error('✖ no dump found: pass --dump=backups/db-full-….dump');
  process.exit(2);
}
const countsPath = dumpPath.replace(/\.dump$/, '.counts.json');
if (!fs.existsSync(countsPath)) {
  console.error(`✖ missing ${path.relative(ROOT, countsPath)} — the counts file is what the restore is compared against`);
  process.exit(2);
}
const source = JSON.parse(fs.readFileSync(countsPath, 'utf8'));

fs.mkdirSync(TMP, { recursive: true });
const container = `nk-restore-${Date.now().toString(36)}`;

function sh(args, opts = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...opts });
}
function cleanup() {
  if (!keep) sh(['rm', '-f', container]);
}
process.on('exit', cleanup);

console.log(`→ restoring ${path.relative(ROOT, dumpPath)} into ${container}:${PORT}`);
const started = sh([
  'run', '-d', '--name', container,
  '-e', 'POSTGRES_PASSWORD=ci',
  '-e', 'POSTGRES_DB=restore',
  '-p', `${PORT}:5432`,
  PG_IMAGE,
]);
if (started.status !== 0) {
  console.error('✖ could not start the scratch container');
  console.error((started.stderr || started.stdout).trim());
  process.exit(2);
}

// pg_isready answers during the entrypoint's temporary init server, so wait for a real query.
let ready = false;
for (let i = 0; i < 60; i++) {
  const probe = sh(['exec', container, 'psql', '-U', 'postgres', '-d', 'restore', '-Atc', 'SELECT 1']);
  if (probe.status === 0 && probe.stdout.trim() === '1') {
    ready = true;
    break;
  }
  spawnSync('sleep', ['2']);
}
if (!ready) {
  console.error('✖ the scratch database never became queryable');
  process.exit(2);
}

const copied = sh(['cp', dumpPath, `${container}:/tmp/backup.dump`]);
if (copied.status !== 0) {
  console.error('✖ could not copy the dump into the container');
  console.error((copied.stderr || copied.stdout).trim());
  process.exit(2);
}

// --no-owner --no-privileges: the dump carries no role names, which is exactly what makes it
// restorable outside Supabase. Extensions that only exist on Supabase (pgsodium, supabase_vault,
// pg_graphql, …) can still fail to CREATE; those errors are collected, not fatal.
console.log('→ pg_restore');
const restore = sh([
  'exec', container,
  'pg_restore', '-U', 'postgres', '-d', 'restore', '--no-owner', '--no-privileges',
  '/tmp/backup.dump',
]);
const restoreStderr = `${restore.stderr || ''}`.trim();
const restoreErrors = restoreStderr.split('\n').filter((l) => /^pg_restore: error/i.test(l));
if (restoreErrors.length === 0 && restoreStderr && restore.status !== 0) {
  // No per-object errors but a non-zero exit means pg_restore itself would not run
  // (bad flag, unreadable file) — print it instead of silently comparing against nothing.
  console.log(`pg_restore exit     ${restore.status} → ${restoreStderr.split('\n')[0].slice(0, 200)}`);
}

// ── recompute the fingerprints on the restored copy ────────────────────────
const fingerprintSql = String.raw`\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
SELECT format(
  'SELECT %L, count(*), coalesce(md5(string_agg(md5(x::text), %L ORDER BY md5(x::text))), %L) FROM %I.%I x;',
  n.nspname || '.' || c.relname, '', '-', n.nspname, c.relname
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%'
  AND n.nspname NOT LIKE 'pg\_temp%'
ORDER BY 1
\gexec
`;
const fingerprintFile = path.join(TMP, 'fingerprint-restored.sql');
fs.writeFileSync(fingerprintFile, fingerprintSql);
sh(['cp', fingerprintFile, `${container}:/tmp/fingerprint.sql`]);
const fp = sh(['exec', container, 'psql', '-U', 'postgres', '-d', 'restore', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/fingerprint.sql']);
if (fp.status !== 0) {
  console.error('✖ could not fingerprint the restored tables');
  console.error(`${fp.stderr || fp.stdout}`.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}

const RESULT_LINE = /^([\w]+\.\w+)\|(\d+)\|([0-9a-f]{32}|-)$/;
const restored = {};
for (const line of fp.stdout.split('\n')) {
  const m = line.trim().match(RESULT_LINE);
  if (!m) continue;
  restored[m[1]] = { rows: Number(m[2]), hash: m[3] };
}

// ── compare ────────────────────────────────────────────────────────────────
const matched = [];
const emptyMissing = [];
const mirrored = {};
const missing = [];
const mismatched = [];
for (const [name, expected] of Object.entries(source.tables)) {
  const actual = restored[name];
  if (!actual) {
    (expected.rows === 0 ? emptyMissing : missing).push(`${name} (source has ${expected.rows} rows)`);
    continue;
  }
  if (actual.rows === expected.rows && actual.hash === expected.hash) matched.push(name);
  else mismatched.push(`${name} source=${expected.rows}/${expected.hash.slice(0, 8)} restored=${actual.rows}/${actual.hash.slice(0, 8)}`);
}
// Anything that exists only in the restored copy is extra state the dump invented.
for (const [name, actual] of Object.entries(restored)) {
  if (!(name in source.tables)) mirrored[name] = actual.rows;
}

const emptyTables = Object.entries(source.tables).filter(([, t]) => t.rows === 0).length;
console.log('');
console.log(`source tables       ${Object.keys(source.tables).length} (${emptyTables} empty)`);
console.log(`restored tables     ${Object.keys(restored).length}`);
console.log(`populated matched   ${matched.filter((n) => source.tables[n].rows > 0).length}`);
console.log(`empty matched       ${matched.filter((n) => source.tables[n].rows === 0).length}`);
console.log(`empty not restored  ${emptyMissing.length}${emptyMissing.length ? ` → ${emptyMissing.slice(0, 6).join(', ')}${emptyMissing.length > 6 ? ' …' : ''}` : ''}`);
console.log(`extra in restore    ${Object.keys(mirrored).length}${Object.keys(mirrored).length ? ` → ${Object.entries(mirrored).map(([n, r]) => `${n}(${r})`).join(', ')}` : ''}`);
if (restoreErrors.length > 0) {
  console.log(`pg_restore errors   ${restoreErrors.length}`);
  for (const err of restoreErrors.slice(0, 10)) console.log(`  ${err.slice(0, 200)}`);
}
if (mismatched.length > 0) console.log(`\nMISMATCHED\n  ${mismatched.join('\n  ')}`);
if (missing.length > 0) console.log(`\nMISSING (populated)\n  ${missing.join('\n  ')}`);

// Write the outcome next to the artifact so a later reader does not have to believe a
// terminal transcript: the dump, its counts and this receipt travel together.
const receipt = {
  verifiedAt: new Date().toISOString(),
  dump: path.relative(ROOT, dumpPath).replace(/\\/g, '/'),
  counts: path.relative(ROOT, countsPath).replace(/\\/g, '/'),
  image: PG_IMAGE,
  result: mismatched.length === 0 && missing.length === 0 ? 'matched' : 'failed',
  sourceTables: Object.keys(source.tables).length,
  restoredTables: Object.keys(restored).length,
  populatedMatched: matched.filter((n) => source.tables[n].rows > 0).length,
  emptyMatched: matched.filter((n) => source.tables[n].rows === 0).length,
  rowsCompared: Object.entries(source.tables)
    .filter(([n]) => matched.includes(n))
    .reduce((sum, [, t]) => sum + t.rows, 0),
  emptyNotRestored: emptyMissing,
  missingPopulated: missing,
  mismatched,
  extraInRestore: mirrored,
  pgRestoreErrors: restoreErrors,
};
const receiptPath = dumpPath.replace(/\.dump$/, '.verify.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`\nreceipt             ${path.relative(ROOT, receiptPath).replace(/\\/g, '/')}`);

if (mismatched.length > 0 || missing.length > 0) {
  console.log('\n✖ restore rehearsal FAILED — investigate before trusting the artifact');
  process.exit(1);
}
console.log(`\n✔ restored copy matches the source on every populated table (${matched.filter((n) => source.tables[n].rows > 0).length} tables, ${source.totalRows} rows)`);
if (keep) console.log(`  container ${container} left running on port ${PORT} (--keep)`);
