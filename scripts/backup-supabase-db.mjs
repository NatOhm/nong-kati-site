#!/usr/bin/env node
/**
 * scripts/backup-supabase-db.mjs — full logical backup of the production Supabase database.
 *
 * `backups/db-*.dump` (the earlier artifacts) were made with `--schema public`, so they
 * silently left out `auth`, `storage` and every other schema. This script dumps the whole
 * database and records enough metadata that the artifact can be judged later *without* the
 * source:
 *
 *   1. `pg_dump -Fc` of every non-system schema, written straight into `backups/` (the
 *      container only ever writes through a mount — nothing is stored inside Docker).
 *   2. A per-table row count **and** content fingerprint taken from the source in the same
 *      run: `md5(string_agg(md5(row::text), '' ORDER BY md5(row::text)))`. Ordering by row
 *      hash makes it independent of physical order, so a restore can be compared exactly.
 *   3. A manifest: sizes, sha256, short/idempotent facts about the source (host, port,
 *      database, schema list, server version) with the user and password redacted.
 *
 * Usage
 *   node scripts/backup-supabase-db.mjs            # reads DATABASE_DIRECT_URL/.env.local
 *   SOURCE_DATABASE_URL="postgres://…" node scripts/backup-supabase-db.mjs
 *
 * Then prove the artifact with `node scripts/verify-supabase-backup.mjs`.
 *
 * The password only travels in a 0600 env file that is deleted on exit; the URL is never
 * printed. Read-only: the source is queried with SELECTs and pg_dump only.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// `--out-dir=` (or BACKUP_DIR) lets the artifacts live outside the repository — the dump
// contains customer PII, so a path that a `git clean` or a clone can never resurrect is
// preferable to a git-ignored folder inside the working tree.
const outDirArg = (process.argv.find((a) => a.startsWith('--out-dir=')) ?? '').split('=')[1];
const BACKUPS = path.resolve(outDirArg || process.env.BACKUP_DIR || path.join(ROOT, 'backups'));
const TMP = path.join(ROOT, 'tmp');
const PG_IMAGE = 'postgres:17-alpine';

// ── source URL ─────────────────────────────────────────────────────────────
function readDotenv() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n#]+)"?\s*$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const dotenv = readDotenv();
const rawUrl = process.env.SOURCE_DATABASE_URL || dotenv.DATABASE_DIRECT_URL || dotenv.DATABASE_URL;
if (!rawUrl) {
  console.error('✖ no source URL: set SOURCE_DATABASE_URL or DATABASE_DIRECT_URL/DATABASE_URL in .env.local');
  process.exit(2);
}
// pg_dump cannot run through Supabase's pgbouncer pooler, and pooler URLs carry params
// (`pgbouncer=true`, `connection_limit`) that pg_dump would hand to libpq.
const url = new URL(
  rawUrl
    .replace(/^postgres(ql)?:\/\//, 'http://')
    .replace(/:6543\b/, ':5432')
    .replace(/[?&](pgbouncer|connection_limit)=[^&]*/g, ''),
);

fs.mkdirSync(BACKUPS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const envFile = path.join(TMP, '.pgbackup.env');
fs.writeFileSync(envFile, `PGPASSWORD=${decodeURIComponent(url.password)}\n`, { mode: 0o600 });
process.on('exit', () => fs.rmSync(envFile, { force: true }));

const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
const dumpName = `db-full-${stamp}.dump`;
const shown = (p) => path.relative(ROOT, p).replace(/\\/g, '/') || p;
const countsName = `db-full-${stamp}.counts.json`;
const manifestName = `db-full-${stamp}.manifest.json`;

const pgEnv = [
  '-e', `PGHOST=${url.hostname}`,
  '-e', `PGPORT=${url.port || 5432}`,
  '-e', `PGUSER=${decodeURIComponent(url.username)}`,
  '-e', 'PGSSLMODE=require',
  '-e', 'PGCONNECT_TIMEOUT=30',
];
const database = url.pathname.slice(1);

function fail(what, r) {
  console.error(`✖ ${what}`);
  const detail = `${r.stderr || ''}${r.stdout || ''}`.trim();
  if (detail) console.error(detail.split('\n').slice(-12).join('\n'));
  process.exit(1);
}

// ── 1. source inventory: counts + ordered row-hash fingerprints ────────────
// `\gexec` turns one catalog query into one SELECT per table, so a single psql
// session fingerprints all ~80 tables instead of paying a container start each.
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
const fingerprintFile = path.join(TMP, 'fingerprint.sql');
fs.writeFileSync(fingerprintFile, fingerprintSql);

console.log(`→ source ${url.hostname}:${url.port || 5432}/${database} — fingerprinting every table…`);
const fpRun = spawnSync(
  'docker',
  [
    'run', '--rm',
    '-v', `${fingerprintFile}:/sql/fingerprint.sql:ro`,
    '--env-file', envFile,
    ...pgEnv,
    '-e', `PGDATABASE=${database}`,
    PG_IMAGE,
    'psql', '-v', 'ON_ERROR_STOP=1', '-f', '/sql/fingerprint.sql',
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
if (fpRun.status !== 0) fail('could not fingerprint the source tables', fpRun);

// `\pset` prints a confirmation line of its own ("Field separator is "|""); only lines of the
// exact shape schema.table|count|hash are rows of the result.
const RESULT_LINE = /^([\w]+\.\w+)\|(\d+)\|([0-9a-f]{32}|-)$/;
const tables = {};
for (const line of fpRun.stdout.split('\n')) {
  const m = line.trim().match(RESULT_LINE);
  if (!m) continue;
  tables[m[1]] = { rows: Number(m[2]), hash: m[3] };
}
const tableCount = Object.keys(tables).length;
const rowCount = Object.values(tables).reduce((sum, t) => sum + t.rows, 0);
if (tableCount === 0) fail('the fingerprint query returned no tables — refusing to write an empty manifest', fpRun);
console.log(`   ${tableCount} tables, ${rowCount} rows`);

// ── 2. dump every schema ───────────────────────────────────────────────────
console.log(`→ pg_dump all schemas → ${shown(path.join(BACKUPS, dumpName))}`);
// The dump covers every schema in the database, including ones that hold no tables
// (extensions, graphql, graphql_public). Record them so the artifact's scope is explicit.
const nsRun = spawnSync(
  'docker',
  [
    'run', '--rm',
    '--env-file', envFile,
    ...pgEnv,
    '-e', `PGDATABASE=${database}`,
    PG_IMAGE,
    'psql', '-At', '-c',
    "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1",
  ],
  { encoding: 'utf8' },
);
if (nsRun.status !== 0) fail('could not list the database schemas', nsRun);
const allSchemas = nsRun.stdout.split('\n').map((s) => s.trim()).filter(Boolean);

const dumpRun = spawnSync(
  'docker',
  [
    'run', '--rm',
    '-v', `${BACKUPS}:/out`,
    '--env-file', envFile,
    ...pgEnv,
    '-e', `PGDATABASE=${database}`,
    PG_IMAGE,
    'pg_dump', '-Fc', '-Z6', '--no-owner', '--no-privileges',
    '-f', `/out/${dumpName}`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
if (dumpRun.status !== 0) fail('pg_dump failed', dumpRun);

const dumpPath = path.join(BACKUPS, dumpName);
if (!fs.existsSync(dumpPath) || fs.statSync(dumpPath).size === 0) {
  fail('pg_dump reported success but produced no file', { stdout: dumpPath });
}

// ── 3. artifact facts ──────────────────────────────────────────────────────
const bytes = fs.statSync(dumpPath).size;
const sha256 = createHash('sha256').update(fs.readFileSync(dumpPath)).digest('hex');

const versionRun = spawnSync(
  'docker',
  ['run', '--rm', PG_IMAGE, 'pg_dump', '--version'],
  { encoding: 'utf8' },
);

const schemasWithTables = [...new Set(Object.keys(tables).map((t) => t.split('.')[0]))].sort();
const countsPath = path.join(BACKUPS, countsName);
fs.writeFileSync(
  countsPath,
  `${JSON.stringify(
    {
      note: 'Row count and md5-of-ordered-row-hashes per table, measured on the source at dump time. Rows are hashed with md5(row::text) and the hashes concatenated in sorted order, so the value is independent of physical row order and can be recomputed against a restored copy.',
      source: { host: url.hostname, port: Number(url.port || 5432), database },
      tables,
      totalTables: tableCount,
      totalRows: rowCount,
    },
    null,
    2,
  )}\n`,
);

const manifest = {
  createdAt: new Date().toISOString(),
  source: {
    variable: process.env.SOURCE_DATABASE_URL ? 'SOURCE_DATABASE_URL' : 'DATABASE_DIRECT_URL/DATABASE_URL',
    host: url.hostname,
    port: Number(url.port || 5432),
    database,
    user: '***redacted***',
    password: '***redacted***',
    serverVersion: (versionRun.stdout || '').trim(),
    schemas: allSchemas,
    schemasWithTables,
    note: 'Connection target of the dump. The dump was taken read-only through pg_dump; nothing on the source was modified.',
  },
  location: path.relative(ROOT, BACKUPS).startsWith('..') ? BACKUPS : shown(BACKUPS),
  files: [
    {
      path: path.resolve(BACKUPS, dumpName).replace(/\\/g, '/'),
      role: 'full logical backup, custom format (pg_dump -Fc), every non-system schema',
      bytes,
      sha256,
    },
    {
      path: path.resolve(countsPath).replace(/\\/g, '/'),
      role: 'per-table source row counts + ordered content fingerprints',
      bytes: fs.statSync(countsPath).size,
    },
  ],
  totals: { tables: tableCount, rows: rowCount, populatedTables: Object.values(tables).filter((t) => t.rows > 0).length },
  restoreHint: `node scripts/verify-supabase-backup.mjs --dump=backups/${dumpName} (see docs/db-backup-restore.md)`,
  covers: [
    'rows and DDL of every non-system schema in this database (public, auth, storage, and Supabase bookkeeping schemas)',
    'table data, indexes, constraints, sequences, and the _prisma_migrations history',
  ],
  doesNotCover: [
    'ownership and GRANTs (dumped with --no-owner --no-privileges; a restore needs no Supabase roles)',
    'Storage binaries in the S3-compatible bucket — only the rows in storage.objects that reference them',
    'Supabase Auth users beyond their rows in auth.users (no passwords in plaintext, but no external identity state)',
    'database roles, publications, and anything outside this database (other projects in the org)',
  ],
};
const manifestPath = path.join(BACKUPS, manifestName);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`✔ ${shown(dumpPath)}  ${(bytes / 1024 / 1024).toFixed(1)} MB  sha256 ${sha256.slice(0, 16)}…`);
console.log(`✔ ${shown(countsPath)}  ${tableCount} tables / ${rowCount} rows`);
console.log(`✔ ${shown(manifestPath)}`);
