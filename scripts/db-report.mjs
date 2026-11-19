#!/usr/bin/env node
/**
 * scripts/db-report.mjs — READ-ONLY: how many rows does each table hold?
 *
 * Every ops question of the "is the data where I think it is?" kind used to be
 * answered in phpMyAdmin, and that path is broken on this host: the SQL tab
 * clears its editor on Go and never navigates, and a GET with `sql_query` answers
 * `ValueError` (recorded in AGENTS.md → Plesk ops). Table Browse works but only
 * one table at a time, with `&session_max_rows=100` to make it readable.
 *
 * This script is that Browse, for every table at once, in one command.
 *
 * What it does: reads `information_schema.TABLES` for the current schema, then
 * counts each table exactly (`SELECT COUNT(*)`). The estimate column
 * `TABLE_ROWS` is deliberately not used — InnoDB approximates it, and "about
 * 3,000 rows" is not an answer to "did the import land?". Nothing is written,
 * ever — no CREATE, no UPDATE, no migration. Point it at production and it only
 * counts.
 *
 * Usage:
 *   node scripts/db-report.mjs                 # every table, exact counts
 *   node scripts/db-report.mjs --table=Order   # one table
 *   node scripts/db-report.mjs --json          # same data as JSON
 *   node scripts/db-report.mjs --sizes=SiteSetting   # largest values in one table
 *   node scripts/db-report.mjs --url="mysql://user:pass@host:3306/db"
 *
 * On the host (the documented path, where the shop URL already exists):
 *   npm explore next -- node --env-file=/var/www/vhosts/nongkatistore.com/httpdocs/tmp/nk6/gate.env \
 *     /var/www/vhosts/nongkatistore.com/httpdocs/scripts/db-report.mjs
 *
 * Exit: 0 reported · 2 cannot run (no URL / no such table / DB unreachable)
 */
import { pathToFileURL } from 'node:url';

import { openTunnel } from './lib/plesk-tunnel.mjs';

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const argOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const JSON_OUT = has('json');
const ONLY = argOf('table');
const SIZES = argOf('sizes');
const TOP = Number(argOf('top') || 25);

if (has('help') || has('-h') || argv.includes('-?')) {
  console.log(
    [
      'db-report — row counts for every table in the current schema (read-only)',
      '',
      '  --url=<mysql://…>   database to read (default: $DATABASE_URL)',
      '  --table=<name>      only this table',
      '  --json              machine-readable output',
      '  --sizes=<table>     largest text values in one table (never the values)',
      '  --top=<n>           how many rows --sizes lists (default 25, max 500)',
      '  --help              this text',
      '',
      'Exit: 0 reported · 2 cannot run (no URL / no such table / DB unreachable)',
    ].join('\n'),
  );
  process.exit(0);
}

const die = (msg) => {
  console.error(`✖ db-report: ${msg}`);
  process.exit(2);
};

// A typo in a flag must not silently fall back to "every table", which is the
// expensive read here.
for (const a of argv) {
  if (['--json', '--help', '-h', '-?'].includes(a)) continue;
  if (a.startsWith('--url=') || a.startsWith('--table=')) continue;
  if (a.startsWith('--sizes=') || a.startsWith('--top=')) continue;
  die(`unknown flag ${a}.`);
}

/**
 * Table names come from the server (and from `--table`), so never interpolate
 * one raw. Doubling a backtick is MySQL's own escape, which is why this quotes
 * instead of allow-listing: an allow-list would silently drop a table named
 * `order-item` from the report, and a missing table is worse than a weird one.
 */
const quote = (name) => `\`${String(name).replace(/`/g, '``')}\``;

const bytes = (n) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(n);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

/**
 * Pure: turn collected rows into the report the operator reads. Kept separate so
 * the layout can be exercised without a database.
 */
export function formatReport({ schema, version, tables, totals }) {
  const width = Math.max(5, ...tables.map((t) => t.name.length));
  const lines = [
    'Nong-Kati db-report — read-only',
    `  database   : ${schema}`,
    `  server     : ${version}`,
    `  tables     : ${tables.length} (exact counts)`,
    '',
    `  ${'table'.padEnd(width)}  ${'rows'.padStart(10)}  ${'size'.padStart(9)}`,
  ];
  for (const t of tables) {
    lines.push(`  ${t.name.padEnd(width)}  ${String(t.rows).padStart(10)}  ${bytes(t.bytes).padStart(9)}`);
  }
  lines.push(
    `  ${'—'.repeat(width)}  ${'—'.repeat(10)}  ${'—'.repeat(9)}`,
    `  ${'total'.padEnd(width)}  ${String(totals.rows).padStart(10)}  ${bytes(totals.bytes).padStart(9)}`,
  );
  return lines.join('\n');
}

/**
 * "Why is one table 46 MB?" — the answer is which rows, and how big, never what
 * they contain: slips are PDPA evidence and settings can hold private values, so
 * this prints a key and a byte count only. Read-only like the rest of the script.
 */
async function reportSizes(prisma, schema, table, top) {
  const columns = await prisma.$queryRaw`
    SELECT COLUMN_NAME AS name, DATA_TYPE AS type
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ${schema} AND TABLE_NAME = ${table}
    ORDER BY ORDINAL_POSITION
  `;
  if (columns.length === 0) die(`no table named ${table} in ${schema}.`);

  const named = (want) => columns.find((c) => String(c.name).toLowerCase() === want);
  const value = named('value') ?? columns.find((c) => /text|blob/i.test(String(c.type)));
  if (!value) die(`${table} has no text/blob column to measure.`);
  const label = named('key') ?? columns.find((c) => /char/i.test(String(c.type)));

  const limit = Math.max(1, Math.min(Number.isFinite(top) && top > 0 ? top : 25, 500));
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${label ? `${quote(label.name)} AS k, ` : ''}LENGTH(${quote(value.name)}) AS bytes` +
      ` FROM ${quote(table)} ORDER BY bytes DESC LIMIT ${limit}`,
  );
  const [countRow] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${quote(table)}`);
  const [sizeRow] = await prisma.$queryRaw`
    SELECT DATA_LENGTH + INDEX_LENGTH AS bytes
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ${schema} AND TABLE_NAME = ${table}
  `;

  const measured = rows.reduce((sum, r) => sum + Number(r.bytes ?? 0), 0);
  const body = {
    schema,
    table,
    rows: Number(countRow?.n ?? 0),
    onDiskBytes: Number(sizeRow?.bytes ?? 0),
    listed: rows.length,
    listedBytes: measured,
    largest: rows.map((r, i) => ({
      label: label ? String(r.k) : `#${i + 1}`,
      bytes: Number(r.bytes ?? 0),
    })),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log(
    [
      'Nong-Kati db-report — sizes (values are never printed)',
      `  database : ${schema}`,
      `  table    : ${table} (${body.rows} rows, ${bytes(body.onDiskBytes)} on disk)`,
      `  measured : ${body.listed} largest value(s), ${bytes(body.listedBytes)} of text`,
      '',
      `  ${(label ? 'key' : 'row').padEnd(44)}  ${'bytes'.padStart(10)}`,
    ].join('\n'),
  );
  for (const row of body.largest) {
    console.log(`  ${row.label.padEnd(44).slice(0, 44)}  ${String(row.bytes).padStart(10)}`);
  }
}

async function main() {
  const url = argOf('url') || process.env.DATABASE_URL || '';
  if (!url) {
    die(
      'no database URL (pass --url= or set DATABASE_URL).\n' +
        '  On the host: npm explore next -- node --env-file=…/tmp/nk6/gate.env …/scripts/db-report.mjs',
    );
  }

  const { PrismaClient } = await import('@prisma/client');
  // Same forward as scripts/stock-reconcile.mjs: the shop's user is @localhost, so
  // PLESK_SSH_HOST + a key is the only way to read production from a workstation.
  const tunnel = await openTunnel(url, die);
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const [identity] = await prisma.$queryRaw`SELECT DATABASE() AS name, VERSION() AS v`;
    const schema = identity?.name;
    if (!schema) die('the URL names no database — nothing to report on.');
    const version = String(identity?.v ?? 'unknown');

    if (SIZES) {
      await reportSizes(prisma, schema, SIZES, TOP);
      return;
    }

    const listed = await prisma.$queryRaw`
      SELECT TABLE_NAME AS name, DATA_LENGTH + INDEX_LENGTH AS bytes
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ${schema}
      ORDER BY TABLE_NAME
    `;

    const tables = [];
    for (const row of listed) {
      const name = String(row.name);
      if (ONLY && name !== ONLY) continue;
      // Exact, and the reason this exists: TABLE_ROWS drifts on InnoDB.
      const counted = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${quote(name)}`);
      tables.push({ name, rows: Number(counted?.[0]?.n ?? 0), bytes: Number(row.bytes ?? 0) });
    }

    if (ONLY && tables.length === 0) die(`no table named ${ONLY} in ${schema}.`);

    const totals = {
      rows: tables.reduce((sum, t) => sum + t.rows, 0),
      bytes: tables.reduce((sum, t) => sum + t.bytes, 0),
    };

    if (JSON_OUT) {
      console.log(JSON.stringify({ schema, version, tables, totals }, null, 2));
    } else {
      console.log(formatReport({ schema, version, tables, totals }));
    }
  } catch (err) {
    die(`query failed: ${err?.message ?? err}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
