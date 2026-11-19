#!/usr/bin/env node
/**
 * scripts/restore-drill.mjs — rehearse the restore, don't just trust the dump.
 *
 * `scripts/backup-mariadb.sh` proves a dump was written and gzip-verified. It
 * cannot prove the dump *restores*, and neither can a `ls -l` of the directory:
 * a backup nobody has restored is a hypothesis (2026-11-18). This script is the
 * rehearsal, and it is deliberately loud about being one:
 *
 *   1. verify the `.sha256` sidecar against the compressed file (when present);
 *   2. create a **scratch** database — it refuses if that database already
 *      exists, so it can never take over a real one, and refuses a scratch name
 *      equal to the production database;
 *   3. stream `gunzip` into `mariadb`/`mysql`, so a truncated or corrupt dump
 *      fails the run instead of loading silently;
 *   4. count every table exactly in both databases and diff them;
 *   5. drop the scratch database again (unless `--keep`, for inspection);
 *   6. write a JSON receipt next to the other backup artifacts.
 *
 * The production database is only ever READ (counts). The only writes are the
 * scratch schema and its removal.
 *
 * Usage
 *   node scripts/restore-drill.mjs --dump=/var/backups/nong-kati/nong_kati-….sql.gz \
 *     --url="mysql://user:pass@127.0.0.1:3306/nongka_nongkati_nongkatistore"
 *
 *   --scratch=<name>   scratch database name (default <db>_drill_<UTC stamp>)
 *   --mysql=<path>     client binary (default: mariadb, then mysql)
 *   --collation=…      scratch charset/collation (default utf8mb3_general_ci)
 *   --receipt=<path>   where to write the JSON receipt
 *   --keep             do not drop the scratch database (inspect by hand)
 *   --help
 *
 * Exit: 0 restored and counts match · 1 mismatch or failure · 2 cannot run
 * (no dump / no client / unsafe scratch name / database already exists).
 */
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const has = (name) => argv.includes(`--${name}`);

if (has('help') || argv.includes('-h')) {
  console.log(
    [
      'restore-drill — restore the newest dump into a scratch database and diff the counts',
      '',
      '  --dump=<file.sql.gz>  the dump to rehearse (required)',
      '  --url=<mysql://…>     production URL, read-only (default $DATABASE_URL)',
      '  --scratch=<name>      scratch db (default <db>_drill_<stamp>; must not exist)',
      '  --mysql=<path>        client binary (default mariadb, then mysql)',
      '  --collation=<name>    scratch collation (default utf8mb3_general_ci)',
      '  --receipt=<path>      receipt location (default db-backups/restore-drill-<ts>.verify.json)',
      '  --keep                keep the scratch database',
      '',
      'Exit: 0 counts match · 1 mismatch or failure · 2 cannot run',
    ].join('\n'),
  );
  process.exit(0);
}

const die = (message) => {
  console.error(`✖ restore-drill: ${message}`);
  process.exit(2);
};
const fail = (message) => {
  console.error(`✖ restore-drill: ${message}`);
  process.exit(1);
};

const DUMP = arg('dump');
const URL_ARG = arg('url') || process.env.DATABASE_URL || '';
const COLLATION = arg('collation') || 'utf8mb3_general_ci';
const KEEP = has('keep');

if (!DUMP) die('--dump=<file.sql.gz> is required.');
if (!fs.existsSync(DUMP)) die(`no such dump: ${DUMP}`);
if (!URL_ARG) die('no database URL (pass --url= or set DATABASE_URL).');
if (!/^mysql:\/\//i.test(URL_ARG)) die('the URL must be mysql:// (the shop runs MariaDB).');

const production = new URL(URL_ARG);
const prodDb = decodeURIComponent(production.pathname.replace(/^\//, ''));
if (!prodDb) die('the URL names no database.');

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
const scratchDb = arg('scratch') || `${prodDb}_drill_${stamp}`;

if (scratchDb === prodDb) die('the scratch database must not be the production database.');
if (!/^[A-Za-z0-9_]{1,64}$/.test(scratchDb)) die(`unsafe scratch name: ${scratchDb}`);
if (!/^[a-z0-9_]+$/.test(COLLATION)) die(`unsafe collation: ${COLLATION}`);

/** Connection bits the client needs. The password travels in MYSQL_PWD, never argv. */
function connection(url) {
  return {
    host: url.hostname,
    port: url.port || '3306',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

const conn = connection(production);

/** Pure: does the scratch count match production? Missing tables are a mismatch too. */
export function diffCounts(prodCounts, scratchCounts) {
  const tables = [...new Set([...Object.keys(prodCounts), ...Object.keys(scratchCounts)])].sort();
  const mismatched = tables
    .filter((t) => prodCounts[t] !== scratchCounts[t])
    .map((t) => ({ table: t, production: prodCounts[t] ?? null, restored: scratchCounts[t] ?? null }));
  return { tables: tables.length, mismatched };
}

async function pickClient() {
  const requested = arg('mysql');
  const candidates = requested ? [requested] : ['mariadb', 'mysql'];
  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['--version']);
      return bin;
    } catch (error) {
      if (requested) die(`cannot run ${bin}: ${error.message}`);
    }
  }
  return die('neither mariadb nor mysql is on PATH — pass --mysql=<path>');
}

function clientArgs({ sql, database, withDatabase = true }) {
  const args = [
    '--protocol=TCP',
    '--host',
    conn.host,
    '--port',
    conn.port,
    '--user',
    conn.user,
    '--default-character-set=utf8mb4',
    '--batch',
  ];
  if (withDatabase) args.push(database ?? conn.database);
  args.push('-e', sql);
  return args;
}

function runSql(bin, sql, database) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, clientArgs({ sql, database }), {
      env: { ...process.env, MYSQL_PWD: conn.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `client exited ${code}`));
      else resolve(stdout.trim());
    });
  });
}

/** Pipe the compressed dump through gunzip into the client; corrupt input fails here. */
function importDump(bin, dump, database) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      ['--protocol=TCP', '--host', conn.host, '--port', conn.port, '--user', conn.user, '--default-character-set=utf8mb4', '--batch', database],
      { env: { ...process.env, MYSQL_PWD: conn.password }, stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `client exited ${code} while importing`));
      else resolve();
    });
    pipeline(fs.createReadStream(dump), createGunzip(), child.stdin).catch((error) => {
      child.kill();
      reject(new Error(`the dump did not decompress cleanly: ${error.message}`));
    });
  });
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const quote = (name) => `\`${String(name).replace(/`/g, '``')}\``;

async function tableCounts(prisma, schema) {
  const listed = await prisma.$queryRaw`
    SELECT TABLE_NAME AS name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ${schema} AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `;
  const counts = {};
  for (const row of listed) {
    const [counted] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${quote(row.name)}`);
    counts[String(row.name)] = Number(counted?.n ?? 0);
  }
  return counts;
}

async function main() {
  const bin = await pickClient();

  // 1. The sidecar is how the host proves it published intact bytes; check it first.
  const sidecar = `${DUMP}.sha256`;
  const actualSha = await sha256File(DUMP);
  let expectedSha = null;
  if (fs.existsSync(sidecar)) {
    expectedSha = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
    if (expectedSha !== actualSha) fail(`sha256 sidecar mismatch for ${path.basename(DUMP)}`);
  } else {
    console.log(`· no ${path.basename(sidecar)} beside the dump — rehearsing without the integrity check`);
  }

  // 2. A scratch database that already exists is somebody else's: never adopt it.
  const exists = await runSql(
    bin,
    `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${scratchDb}'`,
    undefined,
  );
  if (exists) die(`database ${scratchDb} already exists — pick another --scratch name`);

  const { PrismaClient } = await import('@prisma/client');
  const productionUrl = production.toString();
  const scratchUrl = (() => {
    const url = new URL(productionUrl);
    url.pathname = `/${scratchDb}`;
    return url.toString();
  })();

  const prod = new PrismaClient({ datasources: { db: { url: productionUrl } } });
  let created = false;
  let scratch = null;
  try {
    const prodCounts = await tableCounts(prod, prodDb);
    const prodTables = Object.keys(prodCounts).length;

    console.log(
      `restore-drill · ${path.basename(DUMP)} → ${scratchDb}\n` +
        `  production: ${prodDb} (${prodTables} tables, read-only)`,
    );

    // 3. Load into the empty schema the way the runbook says to.
    await runSql(
      bin,
      `CREATE DATABASE ${quote(scratchDb)} CHARACTER SET utf8mb3 COLLATE ${COLLATION}`,
      undefined,
    );
    created = true;

    const startedAt = Date.now();
    await importDump(bin, DUMP, scratchDb);
    const importMs = Date.now() - startedAt;
    console.log(`  imported in ${(importMs / 1000).toFixed(1)} s`);

    // 4. Counts, not trust — the same rule the cutover used.
    scratch = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
    const scratchCounts = await tableCounts(scratch, scratchDb);
    const diff = diffCounts(prodCounts, scratchCounts);
    if (diff.tables === 0) fail('the restore produced no tables at all');

    const receipt = {
      drill: 'restore-drill',
      at: new Date().toISOString(),
      dump: path.resolve(DUMP),
      dumpBytes: fs.statSync(DUMP).size,
      sha256: actualSha,
      sidecarVerified: expectedSha ? expectedSha === actualSha : false,
      production: { database: prodDb, tables: prodTables },
      scratch: { database: scratchDb, tables: diff.tables, importMs },
      mismatched: diff.mismatched,
      kept: KEEP,
      result: diff.mismatched.length === 0 ? 'match' : 'mismatch',
    };

    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const receiptPath = path.resolve(
      arg('receipt') || path.join(repoRoot, 'db-backups', `restore-drill-${stamp}.verify.json`),
    );
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    if (diff.mismatched.length > 0) {
      console.error(`  ✖ ${diff.mismatched.length} table(s) differ:`);
      for (const row of diff.mismatched.slice(0, 20)) {
        console.error(`     ${row.table}: production ${row.production}, restored ${row.restored}`);
      }
      console.error(`  receipt: ${receiptPath}`);
      process.exitCode = 1;
    } else {
      console.log(`  ✔ ${diff.tables}/${prodTables} tables match, row for row`);
      console.log(`  receipt: ${receiptPath}`);
    }
  } finally {
    if (created && !KEEP) {
      try {
        await runSql(bin, `DROP DATABASE ${quote(scratchDb)}`, undefined);
        console.log(`  dropped ${scratchDb}`);
      } catch (error) {
        console.error(`  ✖ could not drop ${scratchDb}: ${error.message} — drop it by hand`);
      }
    } else if (created && KEEP) {
      console.log(`  kept ${scratchDb} (--keep)`);
    }
    if (scratch) await scratch.$disconnect().catch(() => {});
    await prod.$disconnect().catch(() => {});
  }
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
