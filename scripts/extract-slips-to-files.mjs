#!/usr/bin/env node
/**
 * scripts/extract-slips-to-files.mjs — move payment-slip evidence out of the database.
 *
 * Slips were stored as `SiteSetting` rows `slip:<32 hex>` holding a
 * `data:image/…;base64,…` string of up to ~6.7 MB, inside the settings table
 * every page reads. They are written as private files now
 * (`src/lib/slipStore.ts`), and this script moves the rows that predate that
 * change:
 *
 *   1. read every `slip:%` row, decode the data URL;
 *   2. write the bytes atomically into NK_SLIP_DIR (default
 *      `<NK_MEDIA_DIR>/private/slips`) under the row's own key;
 *   3. read the file back and compare SHA-256 with the decoded bytes;
 *   4. only then delete the row, and only with --apply.
 *
 * A row is never deleted unless its file is on disk, byte-for-byte verified, so
 * `--apply` is safe to interrupt and safe to re-run (a second run finds nothing
 * to do and says so). Dry-run is the default.
 *
 * The download route reads the file first and falls back to the row, so
 * running this changes no URLs: an admin opening old evidence before and after
 * the move sees the same image.
 *
 * Usage
 *   DATABASE_URL="mysql://user:pass@localhost:3306/nong_kati" \
 *     node scripts/extract-slips-to-files.mjs              # dry run
 *
 *   ... node scripts/extract-slips-to-files.mjs --apply    # writes + deletes
 *
 *   --slip-dir=/mnt/evidence/slips    override NK_SLIP_DIR (a separate disk)
 *   --limit=5                         only the N largest rows
 *
 * The destination is the SAME directory the app serves from — NK_SLIP_DIR, else
 * `<NK_MEDIA_DIR>/private/slips`. Subdirectory matters: `/api/v1/images/<key>`
 * reads only the media root, so a slip written there can never be served
 * publicly. Do not point this at a scratch directory: rows are deleted after
 * their file verifies, so a scratch path strands evidence where the download
 * route will never find it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const APPLY = process.argv.includes('--apply');
// Same rule as src/lib/slipStore.ts: NK_SLIP_DIR wins, otherwise the private
// SUBdirectory of the media root (which the public image route never reads).
const MEDIA_ROOT = path.resolve(process.env.NK_MEDIA_DIR || path.join(ROOT, 'storage', 'media'));
const OUT_DIR = path.resolve(
  arg('slip-dir') || process.env.NK_SLIP_DIR || path.join(MEDIA_ROOT, 'private', 'slips'),
);
const LIMIT = Number(arg('limit') || 0);

function readDotenv() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const dotenv = readDotenv();
const url = process.env.DATABASE_URL || dotenv.DATABASE_URL;
if (!url) {
  console.error('✖ DATABASE_URL (or .env.local) is required');
  process.exit(2);
}
if (!/^mysql:\/\//i.test(url)) {
  console.error('✖ this script targets the MariaDB database (mysql://)');
  process.exit(2);
}

const KEY_RE = /^[0-9a-f]{32}$/;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function decodeValue(value) {
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(value).trim());
  if (!match?.[1] || !match[2]) return null;
  return { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rows = await prisma.$queryRawUnsafe(
    'SELECT `key`, LENGTH(value) AS bytes FROM SiteSetting WHERE `key` LIKE ' +
      "CONCAT('slip:%%') ORDER BY LENGTH(value) DESC" +
      (LIMIT > 0 ? ` LIMIT ${LIMIT}` : ''),
  );

  if (rows.length === 0) {
    console.log(`✔ nothing to do — no slip:* rows left in ${new URL(url).pathname.slice(1)}`);
    return 0;
  }

  const totalBytes = rows.reduce((sum, r) => sum + Number(r.bytes), 0);
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} · ${rows.length} slip row(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB → ${OUT_DIR}`,
  );

  let written = 0;
  let already = 0;
  let deleted = 0;
  let freed = 0;
  const failures = [];
  /** Rows whose key is not `<32 hex>`: no route can serve them, so they are reported, not migrated. */
  const skipped = [];

  for (const row of rows) {
    const key = String(row.key).slice('slip:'.length);
    if (!KEY_RE.test(key)) {
      skipped.push(`${row.key} (${row.bytes} B) — not a 32-hex slip key, unreachable by the download route`);
      continue;
    }
    const setting = await prisma.siteSetting.findUnique({ where: { key: row.key } });
    if (!setting) continue;
    const decoded = decodeValue(setting.value);
    if (!decoded) {
      failures.push(`${row.key}: value is not a base64 image data URL`);
      continue;
    }

    const file = path.join(OUT_DIR, key);
    const want = sha256(decoded.bytes);
    let have = null;
    try {
      have = sha256(fs.readFileSync(file));
    } catch {
      have = null;
    }

    if (have !== want) {
      const partial = `${file}.partial-${process.pid}`;
      fs.writeFileSync(partial, decoded.bytes);
      fs.renameSync(partial, file);
      written++;
    } else {
      already++;
    }

    // Verify from disk, not from memory: the file is the new source of truth.
    const onDisk = fs.readFileSync(file);
    if (onDisk.length !== decoded.bytes.length || sha256(onDisk) !== want) {
      failures.push(`${row.key}: file verification failed (${onDisk.length} vs ${decoded.bytes.length} bytes)`);
      continue;
    }

    if (APPLY) {
      await prisma.siteSetting.delete({ where: { key: row.key } });
      deleted++;
      freed += (decoded.bytes.length * 4) / 3; // data-URL characters ≈ 4/3 of the bytes
    }
  }

  if (written === 0 && already === 0 && deleted === 0) {
    // Every row in this run was skipped (no servable key). Nothing to move: say
    // so, so a re-run reads as the no-op it is instead of an empty report.
    console.log('✔ nothing to do — no slip row with a servable key is left to move');
  } else {
    console.log(
      `files: ${written} written, ${already} already present · rows ${APPLY ? `deleted: ${deleted}` : 'kept (dry run)'}` +
        (APPLY ? ` · ~${(freed / 1024 / 1024).toFixed(1)} MB of data-URL text removed` : ''),
    );
  }

  if (skipped.length > 0) {
    console.log(
      `
${skipped.length} row(s) skipped — their key is not 32 hex, so no route can serve them ` +
        '(dead row, safe to delete by hand):',
    );
    for (const s of skipped.slice(0, 20)) console.log(`  · ${s}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} row(s) left in place:`);
    for (const f of failures.slice(0, 20)) console.error(`  ✖ ${f}`);
    return 1;
  }
  console.log('✔ every slip row has a verified file on disk');
  return 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (err) => {
    console.error(`✖ ${err instanceof Error ? err.message : err}`);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
