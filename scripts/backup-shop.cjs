/**
 * scripts/backup-shop.cjs — full read-only shop snapshot for migration safety.
 *
 * Exports catalog, orders, payments, marketing and settings tables to
 * backups/shop-<timestamp>.json. Pair with scripts/backup-customers.cjs for a
 * complete restore set (customers live in that file).
 *
 * Read-only: SELECTs only. DATABASE_URL comes from .env / .env.local and is
 * never printed. Bytes columns (gift-code ciphertext etc.) are exported as
 * base64 — restorable with NK_GIFT_CODE_ENCRYPTION_KEY, which is NOT in the
 * file. Admin passwordHash/totpSecret are deliberately excluded.
 *
 * Usage:  node scripts/backup-shop.cjs
 */
const fs = require('fs');
const path = require('path');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n#]+)"?/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

const url = loadDatabaseUrl();
if (!url) {
  console.error('✖ DATABASE_URL not found (looked in env, .env.local, .env)');
  process.exit(1);
}

let PrismaClient;
try {
  ({ PrismaClient } = require('@prisma/client'));
} catch {
  console.error('✖ @prisma/client not generated — run: npx prisma generate');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

// ── What gets exported ────────────────────────────────────────────────────
// AdminUser: credentials excluded. Ephemeral security tables (sessions,
// tokens, TOTP challenges, backup codes) are skipped on purpose — they must
// never be restored into a new environment anyway.
const TABLES = [
  // Catalog
  { name: 'categories', model: 'category' },
  { name: 'products', model: 'product' },
  { name: 'productVariants', model: 'productVariant' },
  { name: 'productAliases', model: 'productAlias' },
  { name: 'tags', model: 'tag' },
  { name: 'productTags', model: 'productTag' },
  { name: 'heroSlides', model: 'heroSlide' },
  // Sales
  { name: 'orders', model: 'order' },
  { name: 'orderItems', model: 'orderItem' },
  { name: 'paymentAttempts', model: 'paymentAttempt' },
  { name: 'invoices', model: 'invoice' },
  { name: 'refunds', model: 'refund' },
  { name: 'topUpLogs', model: 'topUpLog' },
  // Marketing / store value
  { name: 'coupons', model: 'coupon' },
  { name: 'couponRedemptions', model: 'couponRedemption' },
  { name: 'giftCodes', model: 'giftCode' },
  { name: 'codeUploadBatches', model: 'codeUploadBatch' },
  // Settings & audit trail
  { name: 'siteSettings', model: 'siteSetting' },
  { name: 'auditLogs', model: 'auditLog' },
  { name: 'stockMoves', model: 'stockMove' },
  { name: 'inventorySnapshots', model: 'inventorySnapshot' },
  { name: 'wishlists', model: 'wishlistItem' },
  { name: 'dataSubjectRequests', model: 'dataSubjectRequest' },
  // Admin directory (sanitized)
  { name: 'adminUsers', model: 'adminUser', select: {
    id: true, email: true, fullName: true, role: true, status: true,
    totpConfirmed: true, mustChangePassword: true,
    sessionsInvalidBefore: true, lastLoginAt: true, createdAt: true, updatedAt: true,
  } },
];

// Buffers → base64 for clean JSON (gift-code ciphertext, hashes, nonces).
// NOTE: JSON.stringify runs Buffer#toJSON BEFORE this replacer, so buffers
// arrive here already reshaped as {type:'Buffer', data:[…]} — handle both forms.
const jsonReplacer = (_k, v) => {
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (v && v.type === 'Buffer' && Array.isArray(v.data)) return Buffer.from(v.data).toString('base64');
  return v;
};

async function main() {
  const out = {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'Supabase (nong-kati production)',
      purpose: 'pre-migration snapshot — Hostatom cutover',
      pairsWith: 'backups/customers-*.json (same day) for a full restore set',
      excludes: ['Customer rows (see customers backup)', 'sessions/tokens/backup codes (ephemeral)',
        'admin passwordHash + admin TOTP secrets (never exported)',
        'NK_GIFT_CODE_ENCRYPTION_KEY (stays in env)'],
    },
    tables: {},
  };
  const missing = [];

  for (const t of TABLES) {
    try {
      out.tables[t.name] = await prisma[t.model].findMany(t.select ? { select: t.select } : {});
    } catch (e) {
      if (/does not exist in the current database/.test(e.message)) {
        missing.push(t.name);
        continue;
      }
      throw e;
    }
  }

  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(outDir, `shop-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(out, jsonReplacer, 2), 'utf8');

  console.log(`✔ shop snapshot → ${path.relative(process.cwd(), file)}`);
  for (const [name, rows] of Object.entries(out.tables)) {
    console.log(`   ${name.padEnd(20)} ${rows.length}`);
  }
  if (missing.length) {
    console.log(`⚠ tables not present in this DB (migration lag), skipped: ${missing.join(', ')}`);
  }
  console.log('  file contains PII + order data — stays local & uncommitted (backups/ is gitignored)');
}

main()
  .catch((e) => { console.error('✖ backup failed:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
