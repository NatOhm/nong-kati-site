#!/usr/bin/env node
/**
 * scripts/purge-test-orders.mjs — one-off cleanup of stale test data (client-approved).
 *
 * Removes:
 *   • Orders NK-2026-000069 + NK-2026-000071 — every dependent row first:
 *     Refund, Invoice, PaymentAttempt, CouponRedemption, GiftCode (detach:
 *     orderId/orderItemId → null), OrderItem; the Order row last.
 *   • Product `test-5hxv` — every dependent row first: StockMove, CodeUploadBatch,
 *     GiftCode rows on its variants (deleted — they are leftovers, not inventory),
 *     InventorySnapshot, then the Product (variants, aliases, tags, wishlist,
 *     cart items cascade).
 *   • `slip:` images in SiteSetting referenced ONLY by the target orders.
 *   • Optional: the qa-rotation-check@example.com test customer (--with-customer),
 *     only when nothing else (other orders, topups, tickets, redemptions) restricts it.
 *
 * DB URL: DATABASE_DIRECT_URL, else DATABASE_URL (.env / .env.local loaded).
 * Pooler :6543/pgbouncer URLs are rewritten to :5432 — one transaction needs a
 * real session. Never prints secret values, codes, or the connection string.
 *
 * Usage:
 *   node scripts/purge-test-orders.mjs           # DRY RUN — reports, writes nothing
 *   node scripts/purge-test-orders.mjs --apply   # real pass — single transaction
 *   node scripts/purge-test-orders.mjs --apply --with-customer
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const WITH_CUSTOMER = process.argv.includes('--with-customer');
// Defaults: the client-approved Oct 1, 2026 cleanup batch. Override with
// repeatable --order <number> (e.g. the slip-E2E probe order) and --slug <slug>.
const CLI_ORDERS = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--order' && process.argv[i + 1]) CLI_ORDERS.push(process.argv[i + 1]);
}
const TARGET_ORDERS = CLI_ORDERS.length ? CLI_ORDERS : ['NK-2026-000069', 'NK-2026-000071'];
const TARGET_SLUG = (() => {
  const i = process.argv.indexOf('--slug');
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : 'test-5hxv';
})();
const TEST_CUSTOMER_EMAIL = 'qa-rotation-check@example.com';

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
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"(.*?)"?\s*$/);
      if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2];
    }
  } catch {
    /* file may not exist */
  }
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

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`test-data purge — ${APPLY ? 'APPLY (real writes, one transaction)' : 'DRY RUN (no writes)'}`);
console.log(`target db: ${dbDisplay}`);
if (pooler) warn('pooler URL detected — rewrote to session-mode :5432 for the transaction.');

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ── Locate targets (same code path for dry-run and apply) ───────────────────
const orders = await prisma.order.findMany({
  where: { orderNumber: { in: TARGET_ORDERS } },
  select: {
    id: true, orderNumber: true, status: true, customerEmail: true,
    totalAmountThb: true, createdAt: true, slipImageUrl: true,
    items: { select: { id: true, variantId: true, skuCode: true, quantity: true, lineTotalThb: true } },
  },
});

for (const n of TARGET_ORDERS) {
  if (!orders.some((o) => o.orderNumber === n)) warn(`order ${n} not found — skipping (already deleted?)`);
}

const product = await prisma.product.findUnique({
  where: { slug: TARGET_SLUG },
  select: {
    id: true, slug: true, name: true, isActive: true, createdAt: true,
    variants: {
      select: {
        id: true, label: true, stock: true, isActive: true,
        _count: { select: { giftCodes: true, orderItems: true, inventory: true, stockMoves: true, uploadBatches: true } },
      },
    },
    _count: { select: { variants: true, aliases: true, tags: true, wishlist: true } },
  },
});

if (!product) warn(`product "${TARGET_SLUG}" not found — skipping (already deleted?)`);

// ── Guards: refuse anything that looks like real revenue or real inventory ──
// Order guard: never touch completed / paid money orders. Test orders are
// unpaid (pending_payment) or dead (expired/cancelled/failed) by definition.
const allowedStatuses = ['pending_payment', 'expired', 'cancelled', 'failed'];
const badStatus = orders.filter((o) => !allowedStatuses.includes(o.status));
if (badStatus.length) {
  die(
    `order(s) ${badStatus.map((o) => o.orderNumber).join(', ')} have status ` +
    `${badStatus.map((o) => o.status).join('/')} — refusing to delete non-test orders. ` +
    'If they really must go, do it by hand in the Supabase SQL editor.'
  );
}
// Product guard: this purge only ever targets the throwaway "test" product.
if (product && product.slug !== TARGET_SLUG) die('product guard tripped: slug mismatch — aborting.');

for (const o of orders) {
  console.log(
    `  order ${o.orderNumber}: status=${o.status} total=${o.totalAmountThb}฿ created=${o.createdAt.toISOString()} ` +
    `email=${o.customerEmail} items=${o.items.length} slipImage=${o.slipImageUrl ? 'yes' : 'no'}`
  );
}
if (product) {
  console.log(
    `  product ${product.slug} ("${product.name}", active=${product.isActive}): ` +
    `${product.variants.length} variants, aliases=${product._count.aliases}, tags=${product._count.tags}, wishlist=${product._count.wishlist}`
  );
  for (const v of product.variants) {
    const c = v._count;
    console.log(
      `    variant ${v.label} (${v.id}): stock=${v.stock} active=${v.isActive} ` +
      `giftCodes=${c.giftCodes} orderItems=${c.orderItems} snapshots=${c.inventory} stockMoves=${c.stockMoves} uploadBatches=${c.uploadBatches}`
    );
  }
}

// ── Slip images: which SiteSetting keys become unreferenced after the purge? ──
// slipImageUrl stores the download ROUTE path; the SiteSetting key is `slip:<hex>`.
const slipKeyOf = (url) => {
  if (!url) return null;
  const route = url.match(/\/api\/v1\/payments\/slip-download\/([0-9a-f]{32})$/);
  if (route) return `slip:${route[1]}`;
  return url.startsWith('slip:') ? url : null;
};
const slipKeys = orders.map((o) => slipKeyOf(o.slipImageUrl)).filter(Boolean);
let slipKeysToDelete = [];
if (slipKeys.length) {
  const others = await prisma.order.findMany({
    where: { slipImageUrl: { not: null }, orderNumber: { notIn: TARGET_ORDERS } },
    select: { slipImageUrl: true },
  });
  const keep = new Set(others.map((r) => slipKeyOf(r.slipImageUrl)).filter(Boolean));
  slipKeysToDelete = [...new Set(slipKeys)].filter((k) => !keep.has(k));
}
// --sweep-orphan-slips: also remove slip: rows no order references at all
// (fallout of earlier purges). Keys are never printed.
const SWEEP_ORPHAN_SLIPS = process.argv.includes('--sweep-orphan-slips');
let orphanSlipKeys = [];
if (SWEEP_ORPHAN_SLIPS) {
  const allOrders = await prisma.order.findMany({ where: { slipImageUrl: { not: null } }, select: { slipImageUrl: true } });
  const referenced = new Set(allOrders.map((r) => slipKeyOf(r.slipImageUrl)).filter(Boolean));
  const allSlipRows = await prisma.siteSetting.findMany({ where: { key: { startsWith: 'slip:' } }, select: { key: true } });
  orphanSlipKeys = allSlipRows.map((r) => r.key).filter((k) => !referenced.has(k));
}

// ── Optional customer removal (only if nothing else restricts it) ──────────
let customerPlan = null;
if (WITH_CUSTOMER) {
  const customer = await prisma.customer.findUnique({
    where: { email: TEST_CUSTOMER_EMAIL },
    select: {
      id: true, email: true, tier: true, createdAt: true,
      _count: { select: { orders: true, topups: true, supportTickets: true, couponRedemptions: true } },
    },
  });
  if (!customer) {
    warn(`customer ${TEST_CUSTOMER_EMAIL} not found — nothing to remove.`);
  } else {
    const otherOrders = await prisma.order.count({
      where: { customerId: customer.id, orderNumber: { notIn: TARGET_ORDERS } },
    });
    const c = customer._count;
    customerPlan = {
      id: customer.id,
      email: customer.email,
      canDelete: otherOrders === 0 && c.topups === 0 && c.supportTickets === 0 && c.couponRedemptions === 0,
      otherOrders,
      counts: c,
    };
    console.log(
      `  customer ${customer.email}: otherOrders=${otherOrders} topups=${c.topups} ` +
      `tickets=${c.supportTickets} redemptions=${c.couponRedemptions} → ` +
      `${customerPlan.canDelete ? 'deletable' : 'NOT deletable (restricting rows exist — leave in place)'}`
    );
  }
}

const itemTotal = orders.reduce((s, o) => s + o.items.length, 0);
const planBits = [
  `${orders.length} order(s) + ${itemTotal} order item(s)`,
  product ? `product ${product.slug} (${product.variants.length} variants)` : null,
  slipKeysToDelete.length ? `${slipKeysToDelete.length} slip image(s)` : null,
  SWEEP_ORPHAN_SLIPS ? `${orphanSlipKeys.length} orphaned slip image(s)` : null,
  customerPlan?.canDelete ? `customer ${customerPlan.email}` : null,
].filter(Boolean);
console.log(`\nplan: delete ${planBits.join(', ')}`);

if (!APPLY) {
  console.log('dry run — nothing written. Re-run with --apply to execute.');
  await prisma.$disconnect();
  process.exit(0);
}

// ── Apply: one transaction, dependency order, fail-closed ───────────────────
const result = await prisma.$transaction(
  async (tx) => {
    let slipDeleted = 0;
    let customerDeleted = false;

    for (const o of orders) {
      const itemIds = o.items.map((i) => i.id);
      // 1) GiftCodes attached to the order/items: detach so the Restrict FKs
      //    let go (codes on test variants are deleted with the product below).
      await tx.giftCode.updateMany({
        where: { orderId: o.id },
        data: { orderId: null, orderItemId: null, reservedAt: null, deliveredAt: null },
      });
      await tx.giftCode.updateMany({
        where: { orderItemId: { in: itemIds } },
        data: { orderItemId: null, reservedAt: null, deliveredAt: null },
      });
      // 2) Restrict children of Order, then the Order itself.
      await tx.refund.deleteMany({ where: { orderId: o.id } });
      await tx.invoice.deleteMany({ where: { orderId: o.id } });
      await tx.paymentAttempt.deleteMany({ where: { orderId: o.id } });
      await tx.couponRedemption.deleteMany({ where: { orderId: o.id } });
      await tx.orderItem.deleteMany({ where: { orderId: o.id } });
      await tx.order.delete({ where: { id: o.id } });
    }

    if (slipKeysToDelete.length || orphanSlipKeys.length) {
      const r = await tx.siteSetting.deleteMany({
        where: { key: { in: [...slipKeysToDelete, ...orphanSlipKeys] } },
      });
      slipDeleted = r.count;
    }

    if (product) {
      const variantIds = product.variants.map((v) => v.id);
      // Restrict children of ProductVariant / CodeUploadBatch first…
      await tx.stockMove.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.codeUploadBatch.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.giftCode.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.inventorySnapshot.deleteMany({ where: { productVariantId: { in: variantIds } } });
      await tx.inventorySnapshot.deleteMany({ where: { productId: product.id } });
      // …then the Product (variants, aliases, tags, wishlist, cart items cascade).
      await tx.product.delete({ where: { id: product.id } });
    }

    if (customerPlan?.canDelete) {
      await tx.customer.delete({ where: { id: customerPlan.id } });
      customerDeleted = true;
    }

    return { slipDeleted, customerDeleted };
  },
  { timeout: 30000 }
);

console.log(
  `✔ purge complete: ${orders.length} order(s), ${itemTotal} order item(s)` +
  (product ? `, product ${product.slug}` : '') +
  (result.slipDeleted ? `, ${result.slipDeleted} slip image(s)` : '') +
  (result.customerDeleted ? `, customer ${customerPlan.email}` : '') +
  '.'
);
await prisma.$disconnect();
