#!/usr/bin/env node
/**
 * scripts/re-encrypt-gift-codes.mjs — Gift-code key rotation (checklist Step 4).
 *
 * Rewrites every GiftCode row from keyVersion 1 → 2 inside ONE transaction:
 *   decrypt (old key) → re-encrypt (new key) → verify roundtrip → UPDATE.
 * Any failure anywhere aborts the whole transaction — the database is never
 * left half-rotated. `codeHash` is untouched (SHA-256 of plaintext is
 * key-independent), so dedup/uniqueness semantics don't change.
 *
 * Keys come from the environment (same names the app reads):
 *   NK_GIFT_CODE_ENCRYPTION_KEY       — current key   (version 1, required)
 *   NK_GIFT_CODE_ENCRYPTION_KEY_V2    — new key       (version 2, required here)
 * DB URL: DATABASE_DIRECT_URL, else DATABASE_URL (.env / .env.local loaded)
 * — direct :5432 URLs are preferred; the pgbouncer :6543 pooler is rewritten
 *   automatically because a single big transaction needs a real session.
 *
 * Usage:
 *   node scripts/re-encrypt-gift-codes.mjs           # DRY RUN — verifies everything, writes nothing
 *   node scripts/re-encrypt-gift-codes.mjs --apply   # real pass — single transaction
 *   NK_GIFT_CODE_ACTIVE_KEY_VERSION=2                # (Infisical, separately) new uploads use V2
 *
 * After --apply + swap + restart, verify (Supabase SQL Editor):
 *   SELECT keyVersion, count(*) FROM "GiftCode" GROUP BY keyVersion;  -- expect: 2 | <total>
 *
 * Never prints codes, keys, or the connection string.
 */
import { readFileSync } from 'node:fs';
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const ALGO = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(2);
}
function warn(msg) {
  console.warn(`⚠ ${msg}`);
}

// ── Env loading (no dotenv dependency; .env.local wins, matching Next.js) ──
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
      if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2];
    }
  } catch {
    /* file may not exist */
  }
}

// ── Keys ────────────────────────────────────────────────────────────────────
function loadKey(envName) {
  const hex = process.env[envName];
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    die(`${envName} must be 64 hex chars (32 bytes) — refusing to continue.`);
  }
  return Buffer.from(hex, 'hex');
}
const V1_KEY = loadKey('NK_GIFT_CODE_ENCRYPTION_KEY');
const V2_KEY = loadKey('NK_GIFT_CODE_ENCRYPTION_KEY_V2');
if (!V1_KEY) die('NK_GIFT_CODE_ENCRYPTION_KEY not set — this script needs BOTH keys.');
if (!V2_KEY) {
  die('NK_GIFT_CODE_ENCRYPTION_KEY_V2 not set.\n' +
      '  Generate one:  openssl rand -hex 32   (store in your password manager)');
}
if (V1_KEY.equals(V2_KEY)) {
  die('V2 key equals the V1 key — rotation would be a no-op. Generate a different key.');
}

// ── DB URL (direct endpoint preferred; pooler rewritten for one big TX) ─────
let dbUrl = process.env['DATABASE_DIRECT_URL'] || process.env['DATABASE_URL'];
if (!dbUrl) die('DATABASE_URL not found (looked in env, .env.local, .env)');
let pooler = false;
if (/(:6543|pgbouncer=true)/.test(dbUrl)) {
  pooler = true;
  dbUrl = dbUrl
    .replace(':6543', ':5432')
    .replace(/([?&])pgbouncer=true&?/, '$1')
    .replace(/[?&]$/, '');
}
let dbDisplay = '(unparsable url)';
try {
  const u = new URL(dbUrl);
  dbDisplay = `${u.hostname}:${u.port || 5432}${u.pathname}`;
} catch {
  /* keep fallback */
}

// ── AES-GCM (same wire format as src/lib/crypto/giftCode.ts) ────────────────
function decrypt(ciphertextWithTag, nonce, key) {
  if (ciphertextWithTag.length < AUTH_TAG_LENGTH) throw new Error('ciphertext too short');
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const ct = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const d = createDecipheriv(ALGO, key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
function encrypt(plain, key) {
  const nonce = randomBytes(12);
  const c = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { ciphertext: Buffer.concat([enc, c.getAuthTag()]), nonce };
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`gift-code key rotation — ${APPLY ? 'APPLY (real writes, one transaction)' : 'DRY RUN (no writes)'}`);
console.log(`target db: ${dbDisplay}`);
if (pooler) warn('pooler URL detected — rewrote to session-mode :5432 for the transaction.');

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// Sanity: local key must decrypt an existing row before we trust the run
// (probe with whichever key the probe row's keyVersion calls for).
const probe = await prisma.giftCode.findFirst({ orderBy: { createdAt: 'asc' } });
if (!probe) {
  console.log('no GiftCode rows — nothing to rotate. Done.');
  await prisma.$disconnect();
  process.exit(0);
}
const probeKey = probe.keyVersion === 2 ? V2_KEY : V1_KEY;
try {
  decrypt(probe.codeEncrypted, probe.nonce, probeKey);
  console.log(`✔ probe: oldest row (keyVersion ${probe.keyVersion}) decrypts with the matching key — keys check out`);
} catch (err) {
  die(`probe FAILED: the key for keyVersion ${probe.keyVersion} does not decrypt existing rows (${err.message}).\n` +
      '  Wrong key or codes were encrypted with something else — aborting before any write.');
}

const rows = await prisma.giftCode.findMany({
  where: { keyVersion: { not: 2 } },
  select: { id: true, codeEncrypted: true, nonce: true, keyVersion: true, codeHash: true },
});
const alreadyV2 = await prisma.giftCode.count({ where: { keyVersion: 2 } });
console.log(`rows to rotate: ${rows.length}  (already at keyVersion 2: ${alreadyV2} — skipped, idempotent)`);
if (rows.length === 0) {
  console.log('nothing to do — all rows already on keyVersion 2.');
  await prisma.$disconnect();
  process.exit(0);
}

let ok = 0;
let failed = 0;
const updates = [];
for (const row of rows) {
  try {
    const oldVersion = row.keyVersion === 2 ? 1 : row.keyVersion; // only 1 supported today
    if (oldVersion !== 1) throw new Error(`unsupported source keyVersion ${row.keyVersion}`);
    const plain = decrypt(row.codeEncrypted, row.nonce, V1_KEY);

    // Roundtrip guard: the new ciphertext must decrypt back to the same code.
    const enc = encrypt(plain, V2_KEY);
    if (decrypt(enc.ciphertext, enc.nonce, V2_KEY) !== plain) {
      throw new Error('roundtrip mismatch (should never happen)');
    }
    updates.push({ id: row.id, ...enc });
    ok += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✖ row ${row.id}: ${err.message}`);
  }
}

console.log(`decrypt+re-encrypt: ${ok} ok, ${failed} failed`);
if (failed > 0) {
  die(`${failed} row(s) could not be re-encrypted — nothing was written. Investigate before applying.`);
}
if (updates.some((u) => u.ciphertext.equals(
  rows.find((r) => r.id === u.id).codeEncrypted,
))) {
  warn('some ciphertexts are byte-identical after re-encryption (random nonce collision — harmless).');
}

if (!APPLY) {
  console.log(`
DRY RUN complete — verified ${ok} row(s) would rotate cleanly.
Real pass (writes everything in ONE transaction, or nothing):
  NK_GIFT_CODE_ENCRYPTION_KEY_V2=<new key> node scripts/re-encrypt-gift-codes.mjs --apply
Then: swap NK_GIFT_CODE_ENCRYPTION_KEY to the new value in Infisical → Plesk Restart App →
      set NK_GIFT_CODE_ACTIVE_KEY_VERSION=2 (or remove it after the swap) → spot-check a delivered code.`);
  await prisma.$disconnect();
  process.exit(0);
}

const result = await prisma.$transaction(async (tx) => {
  let n = 0;
  for (const u of updates) {
    await tx.giftCode.update({
      where: { id: u.id },
      data: { codeEncrypted: u.ciphertext, nonce: u.nonce, keyVersion: 2 },
    });
    n += 1;
  }
  return n;
});

console.log(`✔ ${result} row(s) rotated to keyVersion 2 in a single transaction.`);

// Post-apply verification through the app's own path (new key via V2 fallback).
const check = await prisma.giftCode.findFirst({ where: { keyVersion: 2 } });
try {
  decrypt(check.codeEncrypted, check.nonce, V2_KEY);
  console.log('✔ post-check: a rotated row decrypts with the V2 key');
} catch (err) {
  die(`POST-CHECK FAILED after commit (${err.message}) — do NOT swap Infisical keys yet; investigate.`);
}

console.log(`
NEXT (checklist Step 4, in order):
  1. Infisical → nong-kati → Production → NK_GIFT_CODE_ENCRYPTION_KEY = <V2 value> → save
  2. Plesk → Node.js → Restart App → the 3 curls + spot-check a delivered code
  3. Optional: set NK_GIFT_CODE_ACTIVE_KEY_VERSION=2 in Infisical (new rows stamped 2),
     or leave it unset — after the swap the base key IS the version-2 material.
  4. Supabase SQL: SELECT keyVersion, count(*) FROM "GiftCode" GROUP BY keyVersion;  → 2 | total`);
await prisma.$disconnect();
