#!/usr/bin/env node
/**
 * scripts/archive-postgres/migrate-supabase-to-mariadb.mjs — Phase 3 of docs/db-migration-hostatom-mariadb.md
 *
 * Copies every row out of the production Postgres database and into the MariaDB
 * database the app now points at. `pg_dump` cannot be used for this: it emits
 * Postgres SQL, and the target is MySQL/MariaDB.
 *
 * How it works
 *   1. Reads the source with a throwaway `postgres:17-alpine` container (there is
 *      no local pg client on PATH). `json_agg` returns one JSON array per table,
 *      so no intermediate files and no CSV quoting rules to get wrong.
 *   2. Maps Postgres column names back to Prisma field names (a handful of
 *      columns are `@map`-ed, e.g. PromotionProduct.promotion_id).
 *   3. Writes with the generated Prisma client in FK-safe order — tables that
 *      fail on a foreign key are deferred and retried, so the script does not
 *      need a hand-maintained dependency list.
 *   4. Re-reads both sides and compares row counts per table. Any difference is
 *      a hard failure (exit 1): a silent partial copy is worse than no copy.
 *
 * Usage
 *   TARGET_DATABASE_URL="mysql://user:pass@localhost:3306/nong_kati" \
 *     node scripts/archive-postgres/migrate-supabase-to-mariadb.mjs
 *
 *   --verify-only   skip the copy, just compare what is already there
 *   --table=Foo     copy only one table (debugging; children are not followed)
 *
 * The source password never enters argv: it goes through a 0600 env file that is
 * deleted immediately, and the URL itself is never printed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const ONLY = (process.argv.find((a) => a.startsWith('--table=')) || '').split('=')[1] || null;
const CHUNK = 500;

// ── env ────────────────────────────────────────────────────────────────────
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
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL_TARGET;
if (!targetUrl) {
  console.error('✖ TARGET_DATABASE_URL is required (mysql://user:pass@host:3306/db)');
  process.exit(2);
}
const rawSource = process.env.SOURCE_DATABASE_URL || dotenv.DATABASE_URL;
if (!rawSource) {
  console.error('✖ SOURCE_DATABASE_URL (or DATABASE_URL in .env.local) is required');
  process.exit(2);
}
const sourceUrl = new URL(
  rawSource.replace(/:6543\b/, ':5432').replace(/[?&]pgbouncer=true/, '').replace(/[?&]connection_limit=\d+/, ''),
);

// ── schema → { model, table, fields[] } ────────────────────────────────────
const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);
const models = [];
{
  let current = null;
  for (const line of fs.readFileSync(SCHEMA, 'utf8').split('\n')) {
    const head = line.match(/^model\s+(\w+)\s*\{/);
    if (head) {
      current = { model: head[1], table: head[1], fields: [], blockAttrs: [] };
      models.push(current);
      continue;
    }
    if (/^\}/.test(line)) { current = null; continue; }
    if (!current) continue;
    const blockMap = line.match(/^\s*@@map\("([^"]+)"\)/);
    if (blockMap) { current.table = blockMap[1]; continue; }
    const f = line.match(/^\s+(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!f) continue;
    const [, name, rawType, arr, , attrs] = f;
    if (arr || !SCALARS.has(rawType)) continue;
    const col = (attrs.match(/@map\("([^"]+)"\)/) || [, name])[1];
    current.fields.push({ name, col, type: rawType });
  }
}
const byModel = new Map(models.map((m) => [m.model, m]));

// ── source reader ──────────────────────────────────────────────────────────
const envFile = path.join(ROOT, 'tmp', '.pg-source.env');
fs.mkdirSync(path.dirname(envFile), { recursive: true });
fs.writeFileSync(envFile, `PGPASSWORD=${decodeURIComponent(sourceUrl.password)}\n`, { mode: 0o600 });

function readTable(model) {
  const sql = `SELECT coalesce(json_agg(t), '[]'::json)::text FROM "${model.table}" t;`;
  const r = spawnSync('docker', ['run', '--rm', '--env-file', envFile,
    '-e', `PGHOST=${sourceUrl.hostname}`, '-e', `PGPORT=${sourceUrl.port || 5432}`,
    '-e', `PGUSER=${decodeURIComponent(sourceUrl.username)}`, '-e', `PGDATABASE=${sourceUrl.pathname.slice(1)}`,
    '-e', 'PGSSLMODE=require', 'postgres:17-alpine', 'psql', '-At', '-c', sql], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`source read failed for ${model.table}: ${(r.stderr || '').slice(0, 300)}`);
  return JSON.parse(r.stdout.trim() || '[]');
}

// ── value coercion: Postgres JSON → the type Prisma expects ────────────────
function coerce(field, value) {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'Bytes': {
      const hex = typeof value === 'string' && value.startsWith('\\x') ? value.slice(2) : null;
      if (!hex) throw new Error(`${field.name}: expected bytea hex, got ${typeof value}`);
      return Buffer.from(hex, 'hex');
    }
    case 'DateTime':
      return value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
    case 'Decimal':
      return String(value);
    case 'BigInt':
      return BigInt(value);
    default:
      return value;
  }
}

function toRow(model, pgRow) {
  const row = {};
  const byCol = new Map(model.fields.map((f) => [f.col, f]));
  for (const [col, value] of Object.entries(pgRow)) {
    const field = byCol.get(col);
    if (!field) continue; // column added outside Prisma — not restorable through the client
    row[field.name] = coerce(field, value);
  }
  return row;
}

// ── target writer ──────────────────────────────────────────────────────────
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });

const counts = {};
async function writeTable(model, rows) {
  const delegate = prisma[model.model];

  if (process.env.ETL_DEBUG) {
    const distinct = new Set(rows.map((r) => r.id).filter((v) => typeof v === 'string')).size;
    if (distinct !== rows.length) {
      console.error(`  [debug] ${model.model}: ${rows.length} rows but only ${distinct} distinct ids`);
    }
  }

  // The table was already emptied in the clear phase below, so this is a pure
  // insert. Clearing here too would fight foreign keys: a Category cannot be
  // deleted while its Products still exist, so every retry would collide with
  // its own earlier rows (that is what made a second run on a populated target
  // fail with "Invalid `prisma.category.deleteMany()` invocation").
  try {
    // One transaction for the whole table. Without it a chunked insert that fails
    // half-way leaves rows behind, and the FK retry then dies on PRIMARY — which is
    // exactly what turned a transient FK failure into a run that could not be retried.
    const calls = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      calls.push(delegate.createMany({ data: rows.slice(i, i + CHUNK) }));
    }
    if (calls.length > 0) await prisma.$transaction(calls, { timeout: 120_000 });
    counts[model.model] = rows.length;
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.ETL_DEBUG) {
      console.error('  [debug]', msg.split('\n').filter(Boolean)[0]);
      console.error('  [debug] code=', e?.code, 'meta=', JSON.stringify(e?.meta));
      console.error('  [debug] rows in payload=', rows.length,
        '| rows now in table=', await delegate.count().catch(() => 'n/a'));
    }
    if (!/foreign key|P2003/i.test(msg)) throw e;
    // A failed chunked insert can leave rows behind (the transaction above is meant to
    // prevent that, but a partial commit must never turn a retry into PRIMARY). Clear
    // what we can before the retry; if children exist, the clear phase handles it later.
    await delegate.deleteMany({}).catch(() => undefined);
  }

  // A table that references itself (Category.parentId) cannot satisfy its own
  // foreign key inside one INSERT — MySQL checks constraints row by row and has
  // no deferrable constraints. Fall back to repeated passes: each pass inserts
  // whatever it can, so the roots land first and their children follow.
  const remaining = [...rows];
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      try {
        await delegate.create({ data: remaining[i] });
        remaining.splice(i--, 1);
        progress = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/foreign key|P2003/i.test(msg)) throw e;
      }
    }
  }
  if (remaining.length > 0) {
    const sample = remaining[0];
    const field = Object.entries(sample).find(([, v]) => v === undefined)?.[0];
    // Do not leave the rows this loop did insert behind: the outer retry would collide
    // on PRIMARY and hide the real foreign-key failure.
    await delegate.deleteMany({}).catch(() => undefined);
    throw new Error(
      `${remaining.length} row(s) still violate a foreign key after retries (self-reference or a missing parent)` +
        ` — first stuck row id=${sample.id ?? '?'}${field ? ` field=${field}` : ''}`,
    );
  }
  counts[model.model] = rows.length;
}

async function verify() {
  const report = [];
  let mismatches = 0;
  for (const model of models) {
    const source = counts[model.model] ?? (await countSource(model.model));
    const target = await prisma[model.model].count();
    if (source !== target) { mismatches++; report.push(`  ✖ ${model.model}: source ${source} vs target ${target}`); }
  }
  return { mismatches, report };
}

async function countSource(modelName) {
  const model = byModel.get(modelName);
  const r = spawnSync('docker', ['run', '--rm', '--env-file', envFile,
    '-e', `PGHOST=${sourceUrl.hostname}`, '-e', `PGPORT=${sourceUrl.port || 5432}`,
    '-e', `PGUSER=${decodeURIComponent(sourceUrl.username)}`, '-e', `PGDATABASE=${sourceUrl.pathname.slice(1)}`,
    '-e', 'PGSSLMODE=require', 'postgres:17-alpine', 'psql', '-At', '-c', `SELECT count(*) FROM "${model.table}";`], { encoding: 'utf8' });
  return Number((r.stdout || '0').trim());
}

try {
  if (VERIFY_ONLY) {
    const { mismatches, report } = await verify();
    console.log(mismatches === 0 ? '✔ every table matches' : report.join('\n'));
    process.exit(mismatches === 0 ? 0 : 1);
  }

  const pending = models.filter((m) => !ONLY || m.model === ONLY);

  // ── clear phase ─────────────────────────────────────────────────────────
  // Empty every table this run will write, before inserting anything. A table
  // cannot be emptied while a child still points at it, so failures are
  // expected here and the loop keeps going: each pass removes what it can, and
  // children before parents is exactly the order this converges to. Without
  // this phase a re-run on a populated target dies on the first parent table.
  if (!ONLY) {
    const pendingClear = [...pending];
    let clearing = true;
    while (pendingClear.length > 0 && clearing) {
      clearing = false;
      for (let i = 0; i < pendingClear.length; i++) {
        const model = pendingClear[i];
        try {
          await prisma[model.model].deleteMany({});
          pendingClear.splice(i--, 1);
          clearing = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/foreign key|FOREIGN KEY|P2003/i.test(msg)) throw e;
        }
      }
    }
    if (pendingClear.length > 0) {
      console.error('✖ could not empty: ' + pendingClear.map((m) => m.model).join(', '));
      console.error('  a table that still has children cannot be cleared; is something writing to the target?');
      process.exit(1);
    }
    console.log(`  cleared ${pending.length} table(s) on the target`);
  }

  let progress = true;
  const failures = new Map(); // model -> last error
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const model = pending[i];
      try {
        const rows = readTable(model).map((r) => toRow(model, r));
        await writeTable(model, rows);
        console.log(`  ${model.model.padEnd(24)} ${String(rows.length).padStart(6)} rows`);
        pending.splice(i--, 1);
        progress = true;
        failures.delete(model.model);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/foreign key|FOREIGN KEY|P2003/i.test(msg)) { failures.set(model.model, msg); continue; } // retry after parents
        console.error(`✖ ${model.model}: ${msg.slice(0, 400)}`);
        process.exit(1);
      }
    }
  }
  if (pending.length > 0) {
    console.error('✖ could not insert: ' + pending.map((m) => `${m.model} (${failures.get(m.model) || 'unknown'})`).join(', '));
    process.exit(1);
  }

  const { mismatches, report } = await verify();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n${mismatches === 0 ? '✔' : '✖'} verified ${models.length} tables — ${total} rows copied${mismatches === 0 ? ', every count matches the source' : ''}`);
  if (mismatches > 0) { console.log(report.join('\n')); process.exit(1); }
} finally {
  fs.rmSync(envFile, { force: true });
  await prisma.$disconnect();
}
