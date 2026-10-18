#!/usr/bin/env node
/**
 * scripts/purge-test-product-0y0s.mjs — one-off cleanup (client-approved 2026-10-13).
 * Removes the archived test product `test-0y0s` and the two test orders created
 * while exercising the variants/gift-code/refund flows on 2026-10-05:
 *   • NK-2026-000071 — unpaid test order (pending_payment), store's own email.
 *   • NK-2026-000072 — dummy-buyer test order, refunded. All three accounts
 *     involved (kanoknatzaza2523@…, nongkatimail@… and the super_admin who
 *     issued the refund) share the name "Kanoknat": one operator, their own
 *     refund flow, no real money (the buyer account has 0 top-ups / ฿0.00 ever).
 *     Confirmed NOT a real customer, which is why deleting it is safe.
 * Usage:
 *   node scripts/purge-test-product-0y0s.mjs          # DRY RUN — reports only
 *   node scripts/purge-test-product-0y0s.mjs --apply  # real pass, one transaction
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const TARGET_SLUG = 'test-0y0s';
const TARGET_ORDERS = ['NK-2026-000071', 'NK-2026-000072'];

// Deleting a refunded order destroys a refund record, so that specific state
// must be confirmed again at run time rather than assumed from an earlier read.
const ALLOWED_ORDER_STATUSES = ['pending_payment', 'refunded'];

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
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined && val !== '') process.env[m[1]] = val;
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

console.log(`purge test product ${TARGET_SLUG} — ${APPLY ? 'APPLY (real writes, one transaction)' : 'DRY RUN (no writes)'}`);
console.log(`target db: ${dbDisplay}`);
if (pooler) warn('pooler URL detected — rewrote to session-mode :5432 for the transaction.');

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ── Locate targets (same reads for dry run and apply) ──────────────────────
const product = await prisma.product.findUnique({
  where: { slug: TARGET_SLUG },
  select: {
    id: true,
    slug: true,
    name: true,
    isActive: true,
    variants: {
      select: {
        id: true,
        label: true,
        _count: {
          select: {
            giftCodes: true,
            orderItems: true,
            inventory: true,
            stockMoves: true,
            cartItems: true,
            uploadBatches: true,
          },
        },
      },
    },
    _count: { select: { variants: true, aliases: true, tags: true, wishlist: true } },
  },
});

if (!product) die(`product "${TARGET_SLUG}" not found — already deleted?`);

const variantIds = product.variants.map((v) => v.id);

const orders = await prisma.order.findMany({
  where: { orderNumber: { in: TARGET_ORDERS } },
  select: {
    id: true,
    orderNumber: true,
    status: true,
    customerEmail: true,
    totalAmountThb: true,
    createdAt: true,
    items: { select: { id: true, variantId: true } },
    _count: {
      select: {
        refunds: true,
        invoices: true,
        paymentAttempts: true,
        giftCodes: true,
        items: true,
      },
    },
  },
});

for (const n of TARGET_ORDERS) {
  if (!orders.some((o) => o.orderNumber === n))
    warn(`order ${n} not found — skipping (already deleted?)`);
}

// ── Guards: refuse anything that is not exactly this known test data ────────
// 1. The product must be the archived test product, never a live one.
if (product.isActive)
  die(`product ${TARGET_SLUG} is ACTIVE — refusing to delete a live product.`);

// 2. Both orders must still be in a state confirmed as test data. `refunded`
//    is allow-listed only because this exact order was verified as a dummy
//    buyer (0 top-ups, shared operator name). Anything else stops the run.
const bad = orders.filter((o) => !ALLOWED_ORDER_STATUSES.includes(o.status));
if (bad.length)
  die(
    `order(s) ${bad.map((o) => `${o.orderNumber}=${o.status}`).join(', ')} are outside the ` +
      `allow-listed test statuses (${ALLOWED_ORDER_STATUSES.join('/')}) — refusing to delete.`,
  );

// 3. No variant may be referenced by an order outside the two being deleted.
const foreignItems = await prisma.orderItem.count({
  where: {
    variantId: { in: variantIds },
    orderId: { notIn: orders.map((o) => o.id) },
  },
});

if (foreignItems > 0)
  die(`${foreignItems} order item(s) outside the target orders reference these variants — refusing.`);

const totals = product.variants.reduce(
  (acc, v) => {
    acc.giftCodes += v._count.giftCodes;
    acc.orderItems += v._count.orderItems;
    acc.inventory += v._count.inventory;
    acc.stockMoves += v._count.stockMoves;
    acc.cartItems += v._count.cartItems;
    acc.uploadBatches += v._count.uploadBatches;
    return acc;
  },
  {
    giftCodes: 0,
    orderItems: 0,
    inventory: 0,
    stockMoves: 0,
    cartItems: 0,
    uploadBatches: 0,
  },
);

console.log(
  `  product ${product.slug} ("${product.name}", active=${product.isActive}): ` +
    `${product.variants.length} variants, aliases=${product._count.aliases}, tags=${product._count.tags}, wishlist=${product._count.wishlist}`,
);
console.log(
  `  child rows: giftCodes=${totals.giftCodes} orderItems=${totals.orderItems} inventory=${totals.inventory} stockMoves=${totals.stockMoves} cartItems=${totals.cartItems} uploadBatches=${totals.uploadBatches}`,
);

for (const o of orders) {
  console.log(
    `  order ${o.orderNumber}: status=${o.status} total=${o.totalAmountThb}฿ items=${o.items.length} ` +
      `refunds=${o._count.refunds} invoices=${o._count.invoices} payAttempts=${o._count.paymentAttempts} codes=${o._count.giftCodes}`,
  );
}

const planBits = [
  `product ${product.slug} (${product.variants.length} variants + aliases/tags/wishlist)`,
  `${totals.giftCodes} gift code(s)`,
  `${orders.length} order(s) + ${orders.reduce((s, o) => s + o.items.length, 0)} order item(s)`,
  `${orders.reduce((s, o) => s + o._count.refunds, 0)} refund(s)`,
  `${orders.reduce((s, o) => s + o._count.paymentAttempts, 0)} payment attempt(s)`,
  `${orders.reduce((s, o) => s + o._count.invoices, 0)} invoice(s)`,
];

console.log(`\nplan: delete ${planBits.join(', ')}`);

if (!APPLY) {
  console.log('dry run — nothing written. Re-run with --apply to execute.');
  await prisma.$disconnect();
  process.exit(0);
}

// ── Apply: one transaction, dependency order, fail-closed ──────────────────
const orderIds = orders.map((o) => o.id);
const orderItemIds = orders.flatMap((o) => o.items.map((i) => i.id));

const result = await prisma.$transaction(
  async (tx) => {
    // 1) GiftCode.orderId / orderItemId are Restrict — detach first. These
    //    codes hang off the test product and are deleted in step 3 regardless.
    const detached = await tx.giftCode.updateMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { orderItemId: { in: orderItemIds } },
          { variantId: { in: variantIds } },
        ],
      },
      data: {
        orderId: null,
        orderItemId: null,
        uploadBatchId: null,
        reservedAt: null,
        deliveredAt: null,
      },
    });

    // 2) Restrict children of Order, then the order items, then the orders.
    const refunds = await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    const invoices = await tx.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    const attempts = await tx.paymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
    const coupons = await tx.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    const items = await tx.orderItem.deleteMany({ where: { id: { in: orderItemIds } } });
    const deletedOrders = await tx.order.deleteMany({ where: { id: { in: orderIds } } });

    // 3) Product delete takes variants, aliases, tags, wishlist and cart items
    //    by cascade; its Restrict children (gift codes, inventory snapshots,
    //    upload batches) are cleared explicitly first.
    const snapshots = await tx.inventorySnapshot.deleteMany({ where: { productId: product.id } });
    const codes = await tx.giftCode.deleteMany({ where: { variantId: { in: variantIds } } });
    const batches = await tx.codeUploadBatch.deleteMany({ where: { variantId: { in: variantIds } } });
    const deletedProduct = await tx.product.delete({ where: { id: product.id } });

    return {
      detached: detached.count,
      refunds: refunds.count,
      invoices: invoices.count,
      attempts: attempts.count,
      coupons: coupons.count,
      items: items.count,
      orders: deletedOrders.count,
      snapshots: snapshots.count,
      codes: codes.count,
      batches: batches.count,
      product: deletedProduct.slug,
    };
  },
  { timeout: 60000 },
);

console.log(
  `✔ purge complete: product ${result.product}, ${
    result.orders
  } order(s), ${result.items} order item(s), ` +
    `${result.refunds} refund(s), ${result.attempts} payment attempt(s), ${
      result.invoices
    } invoice(s), ` +
    `${result.coupons} coupon redemption(s), ${result.codes} gift code(s), ${
      result.snapshots
    } inventory snapshot(s), ` +
    `${result.batches} upload batch(s), ${
      result.detached
    } gift code ref(s) detached.`,
);
await prisma.$disconnect();
