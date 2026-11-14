#!/usr/bin/env node
/**
 * scripts/extract-images-to-files.mjs — move uploaded images out of the database.
 *
 * Before this, every admin upload stored the picture as a `SiteSetting` row
 * `image:<key>` whose value was a `data:image/…;base64,…` string, and
 * GET /api/v1/images/[key] decoded it on each request. On Supabase that is
 * metered egress; on the new MariaDB it is still ~36 MB of rows read over and
 * over. Uploads now write files (src/lib/imageStore.ts), and this script moves
 * the rows that predate that change:
 *
 *   1. read every `image:%` row, decode the data URL;
 *   2. write the bytes atomically into NK_MEDIA_DIR (default ./storage/media);
 *   3. read the file back and compare SHA-256 with the decoded bytes;
 *   4. only then delete the row, and only with --apply.
 *
 * A row is never deleted unless its file is on disk, byte-for-byte verified, so
 * `--apply` is safe to interrupt and safe to re-run (a second run finds nothing
 * to do). Dry-run is the default: it writes the files and reports, but keeps
 * every row, so you can compare the shop before flipping anything.
 *
 * Usage
 *   DATABASE_URL="mysql://user:pass@localhost:3306/nong_kati" \
 *     node scripts/extract-images-to-files.mjs                # dry run
 *
 *   ... node scripts/extract-images-to-files.mjs --apply       # writes + deletes
 *
 *   --out-dir=/var/www/.../storage/media   override NK_MEDIA_DIR
 *   --limit=5                              only the N largest rows (sanity check)
 *
 * Payment slips (`slip:%`, ~10 MB) are deliberately NOT touched: they are
 * private evidence covered by the retention job, not public image assets.
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
const OUT_DIR = path.resolve(arg('out-dir') || process.env.NK_MEDIA_DIR || path.join(ROOT, 'storage', 'media'));
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
  console.error('✖ this script targets the MariaDB database (mysql://); the Postgres rows are the source, not the destination');
  process.exit(2);
}

const KEY_RE = /^[0-9a-z-]+$/i;
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
      "CONCAT('image:%') ORDER BY LENGTH(value) DESC" +
      (LIMIT > 0 ? ` LIMIT ${LIMIT}` : ''),
  );

  if (rows.length === 0) {
    console.log(`✔ nothing to do — no image:* rows left in ${new URL(url).pathname.slice(1)}`);
    return 0;
  }

  const totalBytes = rows.reduce((sum, r) => sum + Number(r.bytes), 0);
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} · ${rows.length} image row(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB → ${OUT_DIR}`,
  );

  let written = 0;
  let already = 0;
  let deleted = 0;
  let freed = 0;
  const failures = [];

  for (const row of rows) {
    const key = String(row.key).slice('image:'.length);
    if (!KEY_RE.test(key)) {
      failures.push(`${row.key}: key is not a safe file name`);
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
      freed += decoded.bytes.length * 4 / 3; // data-URL characters ≈ 4/3 of the bytes
    }
  }

  console.log(
    `files: ${written} written, ${already} already present · rows ${APPLY ? `deleted: ${deleted}` : 'kept (dry run)'}` +
      (APPLY ? ` · ~${(freed / 1024 / 1024).toFixed(1)} MB of data-URL text removed` : ''),
  );

  if (failures.length > 0) {
    console.error(`✖ ${failures.length} row(s) could not be extracted:`);
    for (const f of failures.slice(0, 10)) console.error(`   ${f}`);
    return 1;
  }
  return 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (error) => {
    console.error('✖', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
