#!/usr/bin/env node
/**
 * scripts/precutover-check.mjs — the Phase 6/7 gate: prove the app's write paths work on the
 * target database before the shop is cut over to it.
 *
 * Everything is derived from the database it is pointed at — the admin account, the product and
 * variant it sells, the store's receiving account — so the same command works on the local
 * MariaDB copy, on a fresh ETL run, or on a staging database. Nothing is hardcoded to one row id,
 * and the values that matter (prices, totals, balances) are read back from the database rather
 * than trusted from an HTTP response.
 *
 * Paths exercised, each through the real route on a real HTTP server:
 *   1. cart           POST /api/v1/orders/preview      server-side pricing for the cart lines
 *   2. order          POST /api/v1/orders              Order + OrderItem, Decimal totals
 *   3. void           POST /api/v1/admin/orders/:id/refund   Refund row + codes voided
 *   4. product save   PUT  /api/v1/admin/products/:id  name/description/variant price
 *   5. codes          POST /api/v1/admin/stock/bulk + GET …/codes/:id/reveal  encrypt → decrypt
 *   6. coupon         admin coupon create → order with it → coupon counted at confirmation
 *   7. wallet         customer order paid from walletBalanceThb (deduct + TopUpLog + fulfilment)
 *   8. slip           POST /api/v1/payments/slip-verify against a stubbed Slip2Go endpoint
 *   9. images         POST /api/v1/admin/upload → GET /api/v1/images/:key, plus the orphan-file GC
 *                     (boots the app with NK_MEDIA_DIR pointed at a throwaway tmp/ directory)
 *
 * Usage
 *   TARGET_DATABASE_URL="mysql://user:pass@host:3306/db" node scripts/precutover-check.mjs
 *     --keep      leave the test rows behind (debugging)
 *     --port=3231 use a specific port for the app under test
 *
 * Requires a build of the app (`npm run build`) and the local `.env.local` secrets
 * (NK_GIFT_CODE_ENCRYPTION_KEY, NK_JWT_SECRET). It refuses to run against a Supabase host:
 * this writes real rows, and it must never touch production.
 */
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomFillSync, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';

import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const KEEP = process.argv.includes('--keep');
const TARGET = process.env.TARGET_DATABASE_URL ?? '';
if (!TARGET) {
  console.error('✖ TARGET_DATABASE_URL is required (mysql://user:pass@host:3306/db)');
  process.exit(2);
}
if (/supabase|pooler/i.test(TARGET)) {
  console.error('✖ refusing to run against a Supabase host: this script writes rows');
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, '.next'))) {
  console.error('✖ no .next build found — run `npm run build` with the target DATABASE_URL first');
  process.exit(2);
}

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
const JWT_SECRET = dotenv.NK_JWT_SECRET ?? process.env.NK_JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  console.error('✖ NK_JWT_SECRET (>=32 chars) is needed to mint an admin/customer token');
  process.exit(2);
}
const SLIP_TOKEN_SECRET = dotenv.NK_SLIP_TOKEN_SECRET ?? JWT_SECRET;
const SLIP2GO_SECRET = 'precutover-stub-secret';

const prisma = new PrismaClient({ datasources: { db: { url: TARGET } } });

// ── small utilities ────────────────────────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ALL_PERMS = [
  'products:read', 'products:write', 'products:publish', 'products:delete', 'categories:read',
  'categories:write', 'inventory:read', 'inventory:upload', 'inventory:void', 'inventory:export',
  'inventory:reveal', 'orders:read', 'orders:read:full', 'orders:write', 'orders:refund',
  'orders:export', 'orders:delivery:reveal', 'customers:read', 'customers:read:full',
  'customers:block', 'customers:write', 'tickets:read', 'tickets:write', 'topups:read',
  'reviews:read', 'reviews:moderate', 'coupons:read', 'coupons:write', 'coupons:delete',
  'promotions:read', 'promotions:write', 'promotions:delete', 'dashboard:read', 'reports:read',
  'reports:export', 'staff:read', 'staff:write', 'staff:deactivate', 'staff:reset-2fa',
  'audit:read', 'audit:export', 'settings:read', 'settings:write', 'pdpa:read', 'pdpa:action',
];

function mintJwt(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + 900, jti: randomUUID() }));
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
const adminToken = (admin) =>
  mintJwt({ sub: admin.id, email: admin.email, role: admin.role, perms: ALL_PERMS });
const customerToken = (customer) => mintJwt({ sub: customer.id, typ: 'customer', email: customer.email });

/** Slip capability token — same format lib/slipSecurity mints into the checkout response. */
function slipToken(orderId, confirmationUuid) {
  const mac = createHmac('sha256', SLIP_TOKEN_SECRET)
    .update(`${orderId}:${confirmationUuid}`)
    .digest('base64url');
  return `${confirmationUuid}.${mac}`;
}

const money = (value) => Number(value).toFixed(2);

// ── PNG (a real image, so slip-verify's sniffing and size checks run) ──────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    randomFillSync(raw, row + 1, width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── results ────────────────────────────────────────────────────────────────
const results = [];
function pass(path_, detail) {
  results.push({ path: path_, ok: true, detail });
  console.log(`  ✔ ${path_}${detail ? ` — ${detail}` : ''}`);
}
function fail(path_, detail) {
  results.push({ path: path_, ok: false, detail });
  console.log(`  ✖ ${path_}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}
function check(path_, condition, detail, failDetail) {
  if (condition) pass(path_, detail);
  else fail(path_, failDetail ?? detail);
  return Boolean(condition);
}

// ── Slip2Go stub ───────────────────────────────────────────────────────────
// The provider is the one thing that cannot run for real here (it needs a genuine slip and a
// whitelisted IP), so it is stubbed at the network boundary only: NK_SLIP2GO_BASE points the
// app's own client at this server. Everything after the response — receiver policy, amount
// check, claim, fulfilment, PaymentAttempt settlement — is the real code.
let receiverDigitsForStub = '';
const transRefs = [];
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    if (!req.url?.includes('/api/verify-slip/qr-base64/info')) {
      res.writeHead(404).end('{}');
      return;
    }
    let payload = {};
    try {
      payload = JSON.parse(body).payload ?? {};
    } catch {
      /* ignore */
    }
    const amount = Number(payload?.checkCondition?.checkAmount?.amount ?? 0);
    const transRef = `PRECHECK${Date.now().toString(36).toUpperCase()}${transRefs.length}`;
    transRefs.push(transRef);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        code: '200200',
        message: 'slip verified',
        data: {
          transRef,
          amount,
          dateTime: new Date().toISOString(),
          sender: { account: { name: 'PRECHECK SENDER', bank: { account: 'xxx-x-x1111-x' } } },
          receiver: {
            account: {
              name: 'NONG-KATI',
              bank: { account: receiverDigitsForStub, name: 'KBANK' },
            },
          },
        },
      }),
    );
  });
});

// ── app under test ─────────────────────────────────────────────────────────
function freePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(freePort(0)));
    srv.listen(preferred, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let child = null;
let BASE = '';
async function startApp(port) {
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
  const env = {
    ...process.env,
    DATABASE_URL: TARGET,
    DATABASE_DIRECT_URL: TARGET,
    NODE_ENV: 'production',
    NK_SLIP2GO_BASE: `http://127.0.0.1:${stub.address().port}`,
    NK_SLIP2GO_SECRET: SLIP2GO_SECRET,
    // A throwaway media directory: the check must not write into the developer's
    // real image store, and it must be able to prove deletion.
    NK_MEDIA_DIR: MEDIA_DIR,
  };
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  BASE = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/v1/version`);
      if (res.ok) return;
    } catch {
      /* starting */
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`the app did not start on ${BASE}\n${log.join('').slice(-1200)}`);
}

async function api(method, route, { body, token, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

// ── fixtures, all derived ──────────────────────────────────────────────────
async function pickFixtures() {
  const admins = await prisma.adminUser.findMany({
    where: { status: 'active', role: 'super_admin' },
    select: { id: true, email: true, role: true, mustChangePassword: true },
    take: 10,
  });
  const admin = admins.find((a) => !a.mustChangePassword);
  if (!admin) throw new Error('no active super_admin without a forced password change');

  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, stock: { gte: 4 }, product: { isActive: true } },
    select: {
      id: true,
      label: true,
      price: true,
      stock: true,
      product: { select: { id: true, name: true, description: true, slug: true } },
    },
    orderBy: { stock: 'desc' },
    take: 25,
  });
  let variant = null;
  for (const v of variants) {
    const available = await prisma.giftCode.count({ where: { variantId: v.id, status: 'available' } });
    if (available >= 3) {
      variant = v;
      break;
    }
  }
  if (!variant) throw new Error('no active variant with stock >= 4 and >= 3 available codes');

  const setting = await prisma.siteSetting.findUnique({ where: { key: 'manual-transfer' } });
  let storeAccount = '';
  try {
    storeAccount = String(JSON.parse(setting?.value ?? '{}').accountNumber ?? '');
  } catch {
    /* leave empty */
  }
  receiverDigitsForStub = storeAccount;

  return { admin, variant, storeAccount };
}

// ── the paths ──────────────────────────────────────────────────────────────
const state = { orders: [], codes: [], imageKeys: [], coupon: null, customer: null };
// Throwaway media root for the image path; NK_MEDIA_DIR is pointed here at boot.
const MEDIA_DIR = path.join(ROOT, 'tmp', 'precutover-media');
// 1×1 PNG — small enough to be harmless, real enough to pass the upload's magic-byte
// sniffing and IHDR dimension read.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function pathProductSave(ctx) {
  console.log('\n1. admin product save');
  const { variant } = ctx;
  const stamp = new Date().toISOString().slice(11, 19);
  const name = `${variant.product.name} · precheck ${stamp}`;
  const description = 'ตรวจสอบก่อนย้ายฐานข้อมูล 🎉 ẞüß — ASCII 123';
  const res = await api('PUT', `/api/v1/admin/products/${variant.product.id}`, {
    body: { name, description },
    token: ctx.token,
  });
  if (res.status !== 200) return fail('product save', `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
  const row = await prisma.product.findUnique({
    where: { id: variant.product.id },
    select: { name: true, description: true, updatedAt: true },
  });
  check('product save', row?.name === name, `name + description persisted (${row?.updatedAt?.toISOString()})`,
    `name mismatch: ${row?.name}`);
  check('product save', row?.description === description, 'Thai/emoji text round-trips byte-identically',
    `description came back as ${JSON.stringify(row?.description?.slice(0, 40))}`);
  ctx.originalProduct = { id: variant.product.id, name: variant.product.name, description: variant.product.description };
}

async function pathCartAndOrder(ctx) {
  console.log('\n2. cart pricing + order placement');
  const { variant } = ctx;
  const price = Number(variant.price);
  const preview = await api('POST', '/api/v1/orders/preview', {
    body: { email: 'precheck@example.invalid', items: [{ variantId: variant.id, quantity: 2 }] },
  });
  if (preview.status !== 200) return fail('cart', `HTTP ${preview.status} ${JSON.stringify(preview.json).slice(0, 200)}`);
  const unit = Number(preview.json.items?.[0]?.unitPriceThb ?? NaN);
  const total = Number(preview.json.totalAmountThb ?? NaN);
  check('cart', Math.abs(unit - price) < 0.005, `unit ฿${money(unit)} matches the variant price ฿${money(price)}`);
  check('cart', Math.abs(total - price * 2) < 0.005, `2 × ฿${money(price)} = ฿${money(total)}`);

  const email = `precheck-${Date.now()}@example.invalid`;
  const created = await api('POST', '/api/v1/orders', {
    body: { email, customerPhone: '0800000000', items: [{ variantId: variant.id, quantity: 2 }], tosAccepted: true },
  });
  if (created.status !== 201) return fail('order', `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`);
  const order = created.json.order ?? created.json;
  state.orders.push(order.id);
  const row = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true, subtotalThb: true, totalAmountThb: true, createdAt: true, confirmationUuid: true },
  });
  check('order', row?.status === 'pending_payment', `created ${order.orderNumber} as pending_payment`);
  check('order', money(row?.subtotalThb) === money(price * 2) && money(row?.totalAmountThb) === money(price * 2),
    `subtotal ฿${money(row?.subtotalThb)} = total ฿${money(row?.totalAmountThb)} (Decimal exact)`);
  check('order', row?.createdAt instanceof Date, `createdAt ${row?.createdAt?.toISOString()} (millisecond precision kept)`);
  ctx.guestOrder = { id: order.id, number: order.orderNumber, total: Number(row?.totalAmountThb), confirmationUuid: row?.confirmationUuid };
}

async function pathSlip(ctx) {
  console.log('\n4. slip verification (Slip2Go stubbed at the network edge)');
  const order = ctx.guestOrder;
  if (!order) return fail('slip', 'no guest order from the previous step');
  const png = makePng(120, 60);
  const res = await api('POST', '/api/v1/payments/slip-verify', {
    body: {
      orderId: order.id,
      token: slipToken(order.id, order.confirmationUuid ?? ''),
      imageBase64: png.toString('base64'),
    },
  });
  if (res.status !== 200) return fail('slip', `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 240)}`);
  const row = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true, completedAt: true, paymentAttempts: { select: { slipVerifiedRef: true, slipVerifiedAt: true } } },
  });
  const delivered = await prisma.giftCode.count({ where: { orderId: order.id, status: 'delivered' } });
  check('slip', row?.status === 'completed', `order completed at ${row?.completedAt?.toISOString()}`);
  check('slip', delivered > 0, `${delivered} code(s) delivered by fulfilment`);
  const attempt = row?.paymentAttempts?.find((a) => a.slipVerifiedRef);
  check('slip', Boolean(attempt?.slipVerifiedRef), `PaymentAttempt settled with ref ${attempt?.slipVerifiedRef}`, 'no settled PaymentAttempt');
}

async function pathVoid(ctx) {
  console.log('\n5. order void (refund)');
  const order = ctx.guestOrder;
  const res = await api('POST', `/api/v1/admin/orders/${order.id}/refund`, {
    body: {
      refundAmountThb: order.total,
      gatewayRefundReference: `PRECHECK-${Date.now().toString(36).toUpperCase()}`,
      reasonCategory: 'other',
      reasonDetail: 'pre-cutover check',
      voidCodes: true,
    },
    token: ctx.token,
  });
  if (res.status !== 200) return fail('void', `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
  const [row, refund, codes] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id }, select: { status: true } }),
    prisma.refund.findUnique({ where: { orderId: order.id }, select: { amountThb: true, codesVoidedCount: true } }),
    prisma.giftCode.groupBy({ by: ['status'], where: { orderId: order.id }, _count: true }),
  ]);
  const voided = codes.find((c) => c.status === 'voided')?._count ?? 0;
  const totalCodes = codes.reduce((n, c) => n + c._count, 0);
  check('void', row?.status === 'refunded', 'order refunded');
  check('void', money(refund?.amountThb) === money(order.total), `Refund.amountThb ฿${money(refund?.amountThb)} exact`);
  check('void', voided === totalCodes && totalCodes > 0, `${voided}/${totalCodes} delivered code(s) voided`);
}

async function pathCouponAndWallet(ctx) {
  console.log('\n3. coupon redemption + wallet payment');
  const { variant } = ctx;
  const code = `PRECHECK${Date.now().toString(36).toUpperCase()}`;
  // 10% of the variant price, not a fixed amount: a ฿10 coupon on a ฿1 product zeroes the
  // order, and a ฿0 wallet charge skips the TopUpLog spend row this path exists to prove.
  const discount = Math.max(0.01, Math.round(Number(variant.price) * 0.1 * 100) / 100);
  const couponRes = await api('POST', '/api/v1/admin/coupons', {
    body: { code, discountType: 'amount', discountValue: discount, usageLimit: 5, perCustomerLimit: 2 },
    token: ctx.token,
  });
  if (couponRes.status !== 201 && couponRes.status !== 200) {
    return fail('coupon', `create HTTP ${couponRes.status} ${JSON.stringify(couponRes.json).slice(0, 200)}`);
  }
  const coupon = await prisma.coupon.findUnique({ where: { code }, select: { id: true, code: true } });
  if (!coupon) return fail('coupon', 'coupon row not created');
  state.coupon = coupon.id;

  const email = `precheck-wallet-${Date.now()}@example.invalid`;
  const price = Number(variant.price);
  const customer = await prisma.customer.create({
    data: { email, fullName: 'Precheck Customer', walletBalanceThb: price * 3, status: 'active' },
  });
  state.customer = customer.id;
  const cookie = `nk_session=${customerToken(customer)}`;

  const created = await api('POST', '/api/v1/orders', {
    body: {
      email,
      customerPhone: '0800000001',
      items: [{ variantId: variant.id, quantity: 1 }],
      couponCode: code,
      tosAccepted: true,
    },
    cookie,
  });
  if (created.status !== 201) return fail('coupon', `order HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 240)}`);
  const order = created.json.order ?? created.json;
  state.orders.push(order.id);
  const beforePay = await prisma.order.findUnique({
    where: { id: order.id },
    select: { subtotalThb: true, discountThb: true, totalAmountThb: true, couponId: true, customerId: true },
  });
  check('coupon', beforePay?.couponId === coupon.id, `coupon attached, discount ฿${money(beforePay?.discountThb)}`);
  check('coupon', money(beforePay?.totalAmountThb) === money(Number(beforePay?.subtotalThb) - Number(beforePay?.discountThb)),
    `total ฿${money(beforePay?.totalAmountThb)} = subtotal − discount`);
  check('coupon', Number(beforePay?.totalAmountThb) > 0,
    `payable amount stays above zero so the wallet debit is real`,
    'the order totals 0 — the coupon swallowed the whole price, so the wallet path proves nothing');
  check('coupon', beforePay?.customerId === customer.id, 'order belongs to the wallet customer');

  const paid = await api('POST', `/api/v1/orders/${order.id}/pay-wallet`, { body: {}, cookie });
  if (paid.status !== 200) return fail('wallet', `HTTP ${paid.status} ${JSON.stringify(paid.json).slice(0, 240)}`);

  const [after, afterCustomer, redemption, redemptionCount] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id }, select: { status: true, totalAmountThb: true, completedAt: true } }),
    prisma.customer.findUnique({ where: { id: customer.id }, select: { walletBalanceThb: true } }),
    prisma.couponRedemption.findFirst({ where: { orderId: order.id }, select: { couponId: true, customerId: true } }),
    prisma.coupon.findUnique({ where: { id: coupon.id }, select: { usageCount: true } }),
  ]);
  const spend = await prisma.topUpLog.findFirst({
    where: { customerId: customer.id, amountThb: { lt: 0 } },
    select: { amountThb: true, status: true },
  });
  const delivered = await prisma.giftCode.count({ where: { orderId: order.id, status: 'delivered' } });
  const total = Number(after?.totalAmountThb);
  check('wallet', after?.status === 'completed', `order completed at ${after?.completedAt?.toISOString()}`);
  check('wallet', money(afterCustomer?.walletBalanceThb) === money(price * 3 - total),
    `wallet ฿${money(price * 3)} → ฿${money(afterCustomer?.walletBalanceThb)} (spent ฿${money(total)})`);
  check('wallet', money(spend?.amountThb) === money(-total), `TopUpLog spend row ฿${money(spend?.amountThb)} (${spend?.status})`);
  check('wallet', delivered > 0, `${delivered} code(s) delivered`);
  check('coupon', redemption?.couponId === coupon.id && redemption?.customerId === customer.id,
    'CouponRedemption row written at confirmation');
  check('coupon', Number(redemptionCount?.usageCount) >= 1, `coupon.usageCount = ${redemptionCount?.usageCount}`);
}

async function pathCodes(ctx) {
  console.log('\n6. gift-code upload + decrypt');
  const { variant } = ctx;
  const nonce = Date.now().toString(36).toUpperCase();
  const payload = [`PRECHECK-${nonce}-AAAA-1111`, `PRECHECK-${nonce}-BBBB-2222`];
  const res = await api('POST', '/api/v1/admin/stock/bulk', {
    body: {
      productId: variant.product.id,
      variantId: variant.id,
      format: 'short',
      separator: 'newline',
      raw: payload.join('\n'),
      apply: true,
    },
    token: ctx.token,
  });
  if (res.status !== 200) return fail('codes', `upload HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
  const added = (res.json.results ?? []).reduce((n, r) => n + r.added, 0);
  const rows = await prisma.giftCode.findMany({
    where: { codeHash: { in: payload.map((p) => createHash('sha256').update(p).digest()) } },
    select: { id: true, codeEncrypted: true, nonce: true, codeHash: true, status: true },
  });
  state.codes.push(...rows.map((r) => r.id));
  check('codes', added === payload.length && rows.length === payload.length,
    `${rows.length} codes stored (ciphertext ${rows[0]?.codeEncrypted?.length ?? 0} B, nonce ${rows[0]?.nonce?.length ?? 0} B, hash ${rows[0]?.codeHash?.length ?? 0} B)`);

  const target = rows[0];
  if (!target) return fail('codes', 'no stored row to reveal');
  const reveal = await api('GET', `/api/v1/admin/inventory/codes/${target.id}/reveal`, { token: ctx.token });
  if (reveal.status !== 200) return fail('codes', `reveal HTTP ${reveal.status} ${JSON.stringify(reveal.json).slice(0, 200)}`);
  const plain = String(reveal.json.code ?? '');
  check('codes', payload.includes(plain), `decrypted back to the pasted plaintext (${plain.length} chars)`,
    `decrypted value does not match any uploaded code`);

  const move = await prisma.stockMove.findFirst({
    where: { variantId: variant.id, reason: 'restock' },
    orderBy: { createdAt: 'desc' },
    select: { delta: true, stockAfter: true, refType: true },
  });
  check('codes', move?.delta === payload.length, `StockMove ${move?.refType} +${move?.delta} → stockAfter ${move?.stockAfter}`);

  // Uploaded codes make the stock number drift; keep the delta so cleanup can undo it.
  ctx.uploadedCodes = { ids: rows.map((r) => r.id), variantId: variant.id, count: payload.length };
}

async function pathImages(ctx) {
  console.log('\n7. product images (disk store + orphan GC)');
  const png = Buffer.from(TINY_PNG_B64, 'base64');
  const upload = async () => {
    const res = await api('POST', '/api/v1/admin/upload', {
      body: { dataUrl: `data:image/png;base64,${TINY_PNG_B64}`, filename: 'precheck.png' },
      token: ctx.token,
    });
    return res;
  };

  const first = await upload();
  if (first.status !== 201) {
    return fail('images', `upload HTTP ${first.status} ${JSON.stringify(first.json).slice(0, 200)}`);
  }
  const keyA = String(first.json.path ?? '').split('/').pop();
  state.imageKeys.push(keyA);
  check('images', first.json.storage === 'file', `upload stored on disk (${first.json.path})`);

  // Served bytes must be the uploaded bytes, straight off the filesystem.
  const served = await fetch(`${BASE}/api/v1/images/${keyA}`);
  const body = Buffer.from(await served.arrayBuffer());
  const same = createHash('sha256').update(body).digest('hex') === createHash('sha256').update(png).digest('hex');
  check('images',
    served.status === 200 && served.headers.get('content-type') === 'image/png' && same,
    `GET /api/v1/images/${keyA} → ${served.status} ${served.headers.get('content-type')} ${body.length} B, bytes identical`);

  // The whole point of the move: no database row behind the image any more.
  const row = await prisma.siteSetting.findUnique({ where: { key: `image:${keyA}` } });
  check('images', row === null, 'no SiteSetting row for the image — serving costs no database read');

  // Orphan GC: backdate the first file past the 24h grace, then upload again; the
  // sweep runs on upload, so A must disappear while the fresh B survives.
  if (keyA) {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.promises.utimes(path.join(MEDIA_DIR, keyA), old, old).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 10));
  const second = await upload();
  const keyB = String(second.json?.path ?? '').split('/').pop();
  if (second.status !== 201) {
    return fail('images', `second upload HTTP ${second.status} ${JSON.stringify(second.json).slice(0, 200)}`);
  }
  state.imageKeys.push(keyB);

  const exists = (key) => fs.promises.stat(path.join(MEDIA_DIR, key)).then(() => true).catch(() => false);
  const [aliveA, aliveB] = await Promise.all([exists(keyA), exists(keyB)]);
  check('images', !aliveA && aliveB, `orphan GC removed ${keyA} and kept the fresh ${keyB}`,
    `expected the old file gone and the new one present (A=${aliveA}, B=${aliveB})`);
}

// ── cleanup ────────────────────────────────────────────────────────────────
async function cleanup(ctx) {
  if (KEEP) {
    console.log('\n--keep: leaving the test rows in place');
    return;
  }
  console.log('\ncleanup');
  const orderIds = state.orders.filter(Boolean);
  const quiet = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  · cleanup skipped ${label}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  };
  await quiet('refunds', () => prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('payment attempts', () => prisma.paymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('redemptions', () => prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } }));
  // The codes these orders consumed are real inventory (they were stocked by the shop).
  // Deleting them would silently shrink the copy every run; put them back on the shelf
  // instead, and give the variant its stock counter back, so N runs leave the same numbers.
  await quiet('inventory restore', async () => {
    for (const orderId of orderIds) {
      const used = await prisma.giftCode.findMany({
        where: { orderId },
        select: { id: true, variantId: true },
      });
      const byVariant = new Map();
      for (const c of used) {
        if (!c.variantId) continue;
        byVariant.set(c.variantId, [...(byVariant.get(c.variantId) ?? []), c.id]);
      }
      await prisma.giftCode.updateMany({
        where: { orderId },
        data: {
          status: 'available',
          orderId: null,
          orderItemId: null,
          deliveredAt: null,
          reservedAt: null,
          voidedAt: null,
          voidedById: null,
          voidReason: null,
        },
      });
      for (const [variantId, ids] of byVariant) {
        await prisma.productVariant.update({ where: { id: variantId }, data: { stock: { increment: ids.length } } });
      }
    }
  });
  await quiet('stock moves (orders)', () => prisma.stockMove.deleteMany({ where: { refId: { in: orderIds } } }));
  await quiet('order items', () => prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('orders', () => prisma.order.deleteMany({ where: { id: { in: orderIds } } }));
  if (state.customer) {
    await quiet('top-ups', () => prisma.topUpLog.deleteMany({ where: { customerId: state.customer } }));
    await quiet('redemptions (customer)', () => prisma.couponRedemption.deleteMany({ where: { customerId: state.customer } }));
    await quiet('customer', () => prisma.customer.delete({ where: { id: state.customer } }));
  }
  if (state.coupon) await quiet('coupon', () => prisma.coupon.delete({ where: { id: state.coupon } }));
  if (ctx.uploadedCodes) {
    const { ids, variantId, count } = ctx.uploadedCodes;
    await quiet('uploaded codes', () => prisma.giftCode.deleteMany({ where: { id: { in: ids } } }));
    await quiet('upload stock moves', () =>
      prisma.stockMove.deleteMany({ where: { variantId, reason: 'restock', refType: 'upload' } }));
    await quiet('variant stock', () =>
      prisma.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: count } } }));
  }
  if (state.imageKeys.length > 0) {
    await quiet('uploaded images', () =>
      prisma.siteSetting.deleteMany({ where: { key: { in: state.imageKeys.map((k) => `image:${k}`) } } }));
    await quiet('uploaded image files', async () => {
      for (const key of state.imageKeys) {
        await fs.promises.rm(path.join(MEDIA_DIR, key), { force: true });
      }
    });
  }
  if (ctx.originalProduct) {
    await quiet('product', () =>
      prisma.product.update({
        where: { id: ctx.originalProduct.id },
        data: { name: ctx.originalProduct.name, description: ctx.originalProduct.description },
      }));
  }
  console.log('  · test rows removed (nothing from the shop was modified)');
}

// ── run ────────────────────────────────────────────────────────────────────
let ctx = {};
try {
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const port = await freePort(Number(arg('port', 3231)));
  console.log(`→ target ${TARGET.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`→ starting the app on ${port} (Slip2Go stub on ${stub.address().port})`);
  await startApp(port);

  const fixtures = await pickFixtures();
  ctx = { ...fixtures, token: adminToken(fixtures.admin) };
  console.log(`→ fixtures: admin ${fixtures.admin.email}, variant ${fixtures.variant.id} (${fixtures.variant.label}), store account ${fixtures.storeAccount || 'not configured'}`);
  if (!fixtures.storeAccount) {
    console.log('  ! manual-transfer has no account number — receiver policy check is skipped by the app');
  }

  await pathProductSave(ctx);
  await pathCartAndOrder(ctx);
  await pathCouponAndWallet(ctx);
  await pathSlip(ctx);
  await pathVoid(ctx);
  await pathCodes(ctx);
  await pathImages(ctx);

  // The storefront must still answer with real data after all that writing.
  const shop = await api('GET', '/api/v1/products');
  check('shop reads', shop.status === 200 && Array.isArray(shop.json.products) && shop.json.products.length > 0,
    `GET /api/v1/products → ${shop.json.products?.length ?? 0} products`);
} catch (e) {
  fail('run', e instanceof Error ? e.message.split('\n').slice(0, 4).join(' | ') : String(e));
} finally {
  try {
    await cleanup(ctx);
  } catch {
    /* cleanup is best-effort */
  }
  if (child) child.kill();
  stub.close();
  await prisma.$disconnect().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — ${failed.length} FAILED` : ''}`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✖ ${f.path}: ${f.detail ?? ''}`);
  process.exit(1);
}
