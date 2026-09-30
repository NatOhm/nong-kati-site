/**
 * scripts/backup-customers.cjs — read-only backup of customer accounts.
 *
 * Exports every Customer row (plus wishlist/cart counts) to
 * backups/customers-<timestamp>.json. Reads DATABASE_URL from .env / .env.local
 * (dotenv files only, never printed). Safe to run against production:
 * performs SELECTs only — creates nothing, updates nothing.
 *
 * Usage:  node scripts/backup-customers.cjs
 */
const fs = require('fs');
const path = require('path');

// ── Load DATABASE_URL from .env.local / .env without printing anything ──
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

const prisma = new PrismaClient({
  datasources: { db: { url } },
});

// ── Never export password hashes in the general backup ──────────────────
const CUSTOMER_FIELDS = {
  id: true, email: true, fullName: true, phoneNumber: true,
  status: true, emailVerified: true, phoneVerified: true,
  marketingOptIn: true, walletBalanceThb: true, tier: true,
  lastLoginAt: true, createdAt: true, updatedAt: true,
  // intentionally excluded: passwordHash, failedLoginAttempts, lockedUntil
};

async function main() {
  const [customers, orders, wishlists, carts, topups, tickets] = await Promise.all([
    prisma.customer.findMany({ select: CUSTOMER_FIELDS, orderBy: { createdAt: 'asc' } }),
    prisma.order.groupBy({ by: ['customerId'], _count: { _all: true } }),
    prisma.wishlistItem.groupBy({ by: ['customerId'], _count: { _all: true } }),
    // CartItem hangs off Cart (no direct customerId) — count open carts instead.
    prisma.cart.groupBy({ by: ['customerId'], _count: { _all: true } }),
    prisma.topUpLog.groupBy({ by: ['customerId'], _count: { _all: true } }),
    prisma.supportTicket.groupBy({ by: ['customerId'], _count: { _all: true } }),
  ]);

  const byCount = (rows) =>
    Object.fromEntries(rows.map((r) => [r.customerId, r._count._all]));

  const oc = byCount(orders), wc = byCount(wishlists), cc = byCount(carts);
  const tc = byCount(topups), sc = byCount(tickets);

  const data = {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'Supabase (nong-kati production)',
      purpose: 'pre-migration backup — Hostatom cutover',
      note: 'passwordHash excluded on purpose; full restore lives in Supabase itself',
      counts: { customers: customers.length },
    },
    customers: customers.map((c) => ({
      ...c,
      _counts: {
        orders: oc[c.id] || 0,
        wishlistItems: wc[c.id] || 0,
        openCarts: cc[c.id] || 0,
        topups: tc[c.id] || 0,
        supportTickets: sc[c.id] || 0,
      },
    })),
  };

  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(outDir, `customers-${stamp}.json`);

  // Pretty-printed so it can be eyeballed/recovered without tooling;
  // still sensitive (emails, phones) — do not commit.
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');

  console.log(`✔ backed up ${customers.length} customers → ${path.relative(process.cwd(), outFile)}`);
  console.log('  (password hashes excluded; file stays local & uncommitted)');
}

main()
  .catch((e) => { console.error('✖ backup failed:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
