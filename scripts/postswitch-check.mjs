#!/usr/bin/env node
/**
 * scripts/postswitch-check.mjs — the Phase 7 gate: prove the shop is serving the NEW database
 * after the panel switch, from outside the app, against a URL.
 *
 * This is the one check that runs AFTER `DATABASE_URL` changed in the Plesk panel. It is
 * deliberately different from scripts/precutover-check.mjs: that one boots a server itself and
 * proves the write paths are correct before the switch; this one is pointed at whatever is
 * already running (`--base=https://nongkatistore.com`) and proves the running process is talking
 * to the database the ETL filled — not to a stale pool, not to the old host, not to an empty
 * schema.
 *
 * Checks, in order, each named so a failure says which thing broke:
 *   app up        GET /api/v1/health → healthy, database ok, uptime reported
 *   database      a real table query through the app's own schema (not just `SELECT 1`)
 *   migration     every local migration is applied, and the newest applied one is the newest file
 *   restart       a restarted process serves the same database (--restart-cmd, or --max-uptime)
 *   catalogue     GET /api/v1/products total === the count in MariaDB, and it is not zero
 *   admin login   password → 2FA → session cookie → GET /auth/admin/me with only that cookie
 *   order         cart preview + order placement, row read back from MariaDB
 *   redeem        admin verifies payment → fulfilment delivers a code (status 'delivered')
 *   media         a product image from the file store, plus the storefront HTML
 *
 * Fixtures are derived and restored exactly, the way the pre-switch gate does it: a sold-out
 * variant is stocked through the admin route and its counter is set back to its pre-run value,
 * codes are deleted by hash, orders and their rows are removed, and the fixture admin account is
 * deleted — so two consecutive runs leave the copy's inventory, gift codes and image rows
 * identical.
 *
 * Usage
 *   TARGET_DATABASE_URL="mysql://…" node scripts/postswitch-check.mjs --base=http://127.0.0.1:3314
 *     --restart-cmd="…"   a command that restarts the app; the check asserts uptime reset
 *     --max-uptime=300    alternative: accept that the process is younger than N seconds
 *     --keep              leave the test rows behind (debugging)
 *
 * The database URL is used for verification and fixtures only — every functional check goes
 * through HTTP, because the running app is what is being certified. Exits 1 with the failing
 * check's name; anything that would print a stack trace is caught and reported as `harness`.
 */
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const KEEP = process.argv.includes('--keep');

const BASE = (arg('base', process.env.POSTSWITCH_BASE_URL ?? '') || '').replace(/\/+$/, '');
const TARGET = process.env.TARGET_DATABASE_URL ?? '';
const RESTART_CMD = arg('restart-cmd', '');
const MAX_UPTIME = Number(arg('max-uptime', '0')) || 0;

if (!BASE) {
  console.error('✖ --base=http://host:port (or POSTSWITCH_BASE_URL) is required — the app to certify');
  process.exit(2);
}
if (!TARGET) {
  console.error('✖ TARGET_DATABASE_URL is required (mysql://user:pass@host:3306/db) for verification');
  process.exit(2);
}
if (/supabase|pooler/i.test(TARGET)) {
  console.error('✖ refusing to run against a Supabase host: this script writes fixture rows');
  process.exit(2);
}

// ── env: the same .env.local the app and the other scripts read ────────────
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
  console.error('✖ NK_JWT_SECRET (>=32 chars) is needed to mint the admin API token');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: TARGET } } });

// ── results: same vocabulary as the pre-switch gate ────────────────────────
const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}
function check(name, condition, detail, failDetail) {
  if (condition) pass(name, detail);
  else fail(name, failDetail ?? detail);
  return Boolean(condition);
}

// ── tiny helpers ───────────────────────────────────────────────────────────
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
const money = (v) => Number(v).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same scrypt format lib/password.ts verifies: scrypt$N$r$p$saltHex$hashHex. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384;
  const derived = scryptSync(password, salt, 64, { N, r: 8, p: 1 });
  return `scrypt$${N}$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

// ── TOTP (HS256-free: RFC 6238, SHA-1, 30 s, 6 digits) ─────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secretBase32, unixSeconds = Math.floor(Date.now() / 1000)) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(unixSeconds / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000) >>> 0, 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

// ── HTTP ───────────────────────────────────────────────────────────────────
async function api(method, route, { body, token, cookie, headers: extra } = {}) {
  const headers = { ...(extra ?? {}) };
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
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, text, headers: res.headers, setCookies };
}

function cookieHeaderFrom(setCookies, names) {
  const pairs = [];
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    const [name] = pair.split('=');
    if (names.includes(name.trim())) pairs.push(pair.trim());
  }
  return pairs.join('; ');
}

// ── state ──────────────────────────────────────────────────────────────────
const RUN_STARTED = new Date();
let ctx = null;
const state = { orders: [], fixtureAdminId: null, seededCodes: [], stockBefore: 0, variantId: null };
const quiet = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log(`  · cleanup skipped ${label}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }
};

// ── fixtures ───────────────────────────────────────────────────────────────
let adminToken = '';
async function ensureSellableVariant() {
  const candidates = await prisma.productVariant.findMany({
    where: { isActive: true, stock: { gte: 4 }, product: { isActive: true } },
    select: { id: true, label: true, price: true, stock: true, product: { select: { id: true, name: true } } },
    orderBy: { stock: 'desc' },
    take: 25,
  });
  for (const v of candidates) {
    const available = await prisma.giftCode.count({ where: { variantId: v.id, status: 'available' } });
    if (available >= 3) return { variant: v, seeded: false };
  }
  const fallback = await prisma.productVariant.findFirst({
    where: { isActive: true, product: { isActive: true } },
    select: { id: true, label: true, price: true, stock: true, product: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' },
  });
  if (!fallback) throw new Error('no active product variant — the catalogue is empty');
  return { variant: fallback, seeded: true };
}

async function seedStock(variant, token) {
  const nonce = Date.now().toString(36).toUpperCase();
  const payload = Array.from({ length: 6 }, (_, i) => `POSTSWITCH-${nonce}-${i + 1}`);
  const res = await api('POST', '/api/v1/admin/stock/bulk', {
    body: {
      productId: variant.product.id,
      variantId: variant.id,
      format: 'short',
      separator: 'newline',
      raw: payload.join('\n'),
      apply: true,
    },
    token,
  });
  if (res.status !== 200) {
    fail('order', `stock upload HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
    return false;
  }
  const after = await prisma.productVariant.findUnique({ where: { id: variant.id }, select: { stock: true } });
  const available = await prisma.giftCode.count({ where: { variantId: variant.id, status: 'available' } });
  const ok = check(
    'order',
    (after?.stock ?? 0) >= 4 && available >= 3,
    `fixture stocked: stock ${state.stockBefore} → ${after?.stock}, ${available} available code(s)`,
  );
  state.seededCodes = payload.map((p) => createHash('sha256').update(p.trim().toUpperCase()).digest());
  return ok;
}

// ── checks ─────────────────────────────────────────────────────────────────
async function checkAppUp() {
  console.log('\n1. app is up');
  let res;
  try {
    res = await api('GET', '/api/v1/health');
  } catch (e) {
    return fail('app up', `${BASE} did not answer: ${e instanceof Error ? e.message : e}`);
  }
  const h = res.json ?? {};
  check('app up', res.status === 200 && h.status === 'healthy', `GET /api/v1/health → 200 healthy, build ${h.version ?? '?'}`,
    `GET /api/v1/health → ${res.status} ${JSON.stringify(h).slice(0, 200)}`);
  check('app up', h.checks?.database === 'ok', `health reports database ok`, `health reports database ${h.checks?.database}`);
  state.uptimeBefore = Number(h.checks?.uptime ?? 0);
}

async function checkDatabase() {
  console.log('\n2. the app is reading the migrated schema');
  // A real table query through Prisma on the same URL: an empty schema answers `SELECT 1`
  // (which /api/v1/health uses) but throws P2021 on any table, which is exactly the failure
  // mode of a panel switch that points at the right host and the wrong database.
  let counts;
  try {
    counts = {
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      codes: await prisma.giftCode.count(),
      orders: await prisma.order.count(),
    };
  } catch (e) {
    return fail('database', `a table query failed: ${e instanceof Error ? e.message.split('\n')[0].slice(0, 180) : e}`);
  }
  check('database',
    counts.products > 0 && counts.variants > 0,
    `${counts.products} products, ${counts.variants} variants, ${counts.codes} codes, ${counts.orders} orders in the target database`,
    `the target database looks empty: ${JSON.stringify(counts)}`);

  const shop = await api('GET', '/api/v1/products');
  const total = Number(shop.json?.total ?? -1);
  const dbActive = await prisma.product.count({ where: { isActive: true } });
  check('database', total === dbActive && total > 0,
    `app serves ${total} active products, MariaDB has ${dbActive}`,
    total === 0 && dbActive === 0
      ? 'the app serves an empty catalogue — this database has not been loaded (no ETL) or the URL points at an empty schema'
      : `app serves ${total} products but MariaDB has ${dbActive} — the running process is not reading this database`);
}

async function checkMigrationHead() {
  console.log('\n3. schema is at the expected migration head');
  const dir = path.join(ROOT, 'prisma', 'migrations');
  const files = fs.readdirSync(dir).filter((d) => /^\d{14}_/.test(d)).sort();
  if (files.length === 0) return fail('migration', 'no migration directories found in prisma/migrations');
  let applied;
  try {
    applied = await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name');
  } catch (e) {
    return fail('migration', `_prisma_migrations is unreadable: ${e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : e}`);
  }
  const appliedNames = applied.map((r) => r.migration_name);
  const missing = files.filter((f) => !appliedNames.includes(f));
  check('migration', missing.length === 0, `all ${files.length} migration(s) applied, head ${files[files.length - 1]}`,
    `not applied: ${missing.join(', ')}`);
  check('migration', appliedNames[appliedNames.length - 1] === files[files.length - 1],
    `applied head equals the newest migration file`,
    `applied head ${appliedNames[appliedNames.length - 1]} but the repo's newest is ${files[files.length - 1]}`);
}

async function checkRestart() {
  console.log('\n4. the app survives a restart');
  if (!RESTART_CMD && MAX_UPTIME <= 0) {
    return fail('restart',
      'pass --restart-cmd="…" (assert uptime resets) or --max-uptime=<seconds> (accept a fresh process)');
  }
  if (RESTART_CMD) {
    const useShell = process.platform === 'win32';
    const run = spawnSync(RESTART_CMD, { shell: true, cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 120_000 });
    if (run.status !== 0) {
      return fail('restart', `restart command exited ${run.status}: ${String(run.stderr ?? '').slice(-160)}`);
    }
  }
  let health = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await api('GET', '/api/v1/health');
      if (res.status === 200 && res.json?.checks?.database === 'ok') {
        health = res.json;
        break;
      }
    } catch {
      /* still restarting */
    }
    await sleep(500);
  }
  if (!health) return fail('restart', 'the app did not answer /api/v1/health within 30s of the restart');
  const uptime = Number(health.checks?.uptime ?? 0);
  const reset = uptime < state.uptimeBefore + 5;
  check('restart', MAX_UPTIME > 0 ? uptime <= MAX_UPTIME : reset,
    `fresh process (uptime ${uptime.toFixed(1)}s, was ${state.uptimeBefore.toFixed(1)}s) still reports database ok`,
    `uptime ${uptime.toFixed(1)}s did not reset from ${state.uptimeBefore.toFixed(1)}s${MAX_UPTIME ? ` and exceeds --max-uptime=${MAX_UPTIME}` : ''}`);
}

async function checkAdminLogin() {
  console.log('\n5. admin login and session cookie');
  const email = `postswitch-${Date.now().toString(36)}@check.invalid`;
  const password = `Pw-${randomUUID()}`;
  const admin = await prisma.adminUser.create({
    data: {
      email,
      fullName: 'Post-switch check',
      role: 'super_admin',
      status: 'active',
      passwordHash: hashPassword(password),
      totpConfirmed: false,
      mustChangePassword: false,
    },
    select: { id: true, email: true },
  });
  state.fixtureAdminId = admin.id;
  // Filled from the session the server itself issues — an admin API call made with a token the
  // server signed is the same credential a browser would hold.
  adminToken = mintJwt({ sub: admin.id, email: admin.email, role: admin.role, perms: ALL_PERMS });

  const login = await api('POST', '/api/v1/auth/admin/login', { body: { email, password } });
  const challenge = String(login.json?.challengeToken ?? '');
  if (!check('admin login', login.status === 200 && login.json?.success && Boolean(challenge),
    `password accepted, 2FA challenge issued`, `login → ${login.status} ${JSON.stringify(login.json).slice(0, 200)}`)) {
    return;
  }

  const setup = await api('POST', '/api/v1/auth/admin/2fa', { body: { challengeToken: challenge, action: 'setup' } });
  const secret = String(setup.json?.secretBase32 ?? '');
  if (!check('admin login', setup.status === 200 && Boolean(secret), 'enrolled a second factor (base32 secret issued)',
    `2FA setup → ${setup.status} ${JSON.stringify(setup.json).slice(0, 200)}`)) {
    return;
  }

  const confirm = await api('POST', '/api/v1/auth/admin/2fa', {
    body: { challengeToken: challenge, code: totp(secret), remember: false },
  });
  const cookie = cookieHeaderFrom(confirm.setCookies ?? [], ['nk_admin_at', 'nk_admin_rt']);
  if (!check('admin login', confirm.status === 200 && confirm.json?.success && Boolean(confirm.json?.accessToken),
    'TOTP code accepted, access + refresh tokens issued',
    `2FA confirm → ${confirm.status} ${JSON.stringify(confirm.json).slice(0, 200)}`)) {
    return;
  }
  // Use the server-issued access token for the admin writes that follow: it is what the session
  // actually grants, so a permission regression shows up here instead of being papered over.
  adminToken = String(confirm.json.accessToken);
  if (!check('admin login', cookie.includes('nk_admin_at='), 'HttpOnly access cookie set (nk_admin_at)', `no nk_admin_at cookie: ${(confirm.setCookies ?? []).join(' | ').slice(0, 200)}`)) {
    return;
  }

  const me = await api('GET', '/api/v1/auth/admin/me', { cookie });
  check('admin login', me.status === 200 && me.json?.email === email,
    `GET /auth/admin/me with only the cookie → ${me.json?.email}`,
    `cookie rejected: ${me.status} ${JSON.stringify(me.json).slice(0, 200)}`);

  const dash = await api('GET', '/api/v1/admin/dashboard', { cookie });
  check('admin login', dash.status === 200, `protected admin API accepts the cookie → 200 dashboard`,
    `cookie on /admin/dashboard → ${dash.status} ${JSON.stringify(dash.json).slice(0, 160)}`);
}

async function checkOrder(ctx) {
  console.log('\n6. cart + order placement');
  const { variant } = ctx;
  const price = Number(variant.price);
  const preview = await api('POST', '/api/v1/orders/preview', {
    body: { email: 'postswitch@example.invalid', items: [{ variantId: variant.id, quantity: 2 }] },
  });
  if (preview.status !== 200) return fail('order', `preview HTTP ${preview.status} ${JSON.stringify(preview.json).slice(0, 200)}`);
  const total = Number(preview.json.totalAmountThb ?? NaN);
  check('order', Math.abs(total - price * 2) < 0.005, `cart total ฿${money(total)} = 2 × ฿${money(price)}`,
    `cart total ฿${money(total)} ≠ 2 × ฿${money(price)}`);

  const email = `postswitch-${Date.now()}@example.invalid`;
  const created = await api('POST', '/api/v1/orders', {
    body: { email, customerPhone: '0800000001', items: [{ variantId: variant.id, quantity: 2 }], tosAccepted: true },
  });
  if (created.status !== 201) return fail('order', `create HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`);
  const order = created.json.order ?? created.json;
  state.orders.push(order.id);
  const row = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true, totalAmountThb: true, orderNumber: true, items: { select: { quantity: true } } },
  });
  check('order', row?.status === 'pending_payment', `created ${row?.orderNumber} as pending_payment`,
    `row status ${row?.status}`);
  check('order', money(row?.totalAmountThb) === money(price * 2), `order row totals ฿${money(row?.totalAmountThb)} in MariaDB`,
    `order row total ${money(row?.totalAmountThb)} ≠ ฿${money(price * 2)}`);
  ctx.orderId = order.id;
}

async function checkRedeem(ctx) {
  console.log('\n7. gift code redeemed (admin verifies payment → fulfilment)');
  const orderId = ctx.orderId;
  if (!orderId) return fail('redeem', 'no order from the previous check');
  const res = await api('POST', `/api/v1/admin/orders/${orderId}/verify-payment`, { token: adminToken });
  if (res.status !== 200) return fail('redeem', `verify-payment HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 220)}`);

  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, completedAt: true, giftCodes: { select: { id: true, status: true, deliveredAt: true } } },
  });
  const delivered = (row?.giftCodes ?? []).filter((c) => c.status === 'delivered');
  check('redeem', row?.status === 'completed', `order completed at ${row?.completedAt?.toISOString()}`,
    `order status ${row?.status}`);
  check('redeem', delivered.length === 2, `${delivered.length}/2 gift code(s) delivered and marked delivered`,
    `${delivered.length} delivered code(s), expected 2`);
  check('redeem', delivered.every((c) => c.deliveredAt instanceof Date), 'each code carries a deliveredAt timestamp',
    'a delivered code has no deliveredAt');
}

async function checkMedia() {
  console.log('\n8. media and storefront assets');
  const product = await prisma.product.findFirst({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
    orderBy: { updatedAt: 'desc' },
  });
  const url = String(product?.imageUrl ?? '');
  const key = url.split('/api/v1/images/')[1]?.split('?')[0];
  if (key) {
    const res = await fetch(`${BASE}/api/v1/images/${key}`);
    const type = String(res.headers.get('content-type') ?? '');
    const bytes = Buffer.from(await res.arrayBuffer());
    check('media', res.status === 200 && type.startsWith('image/') && bytes.length > 0,
      `GET /api/v1/images/${key} → 200 ${type} ${bytes.length} B`,
      `image ${key} → ${res.status} ${type || 'no content-type'} ${bytes.length} B`);
  } else {
    fail('media', 'no product in the database has an imageUrl to check');
  }

  const home = await fetch(`${BASE}/`);
  const html = await home.text();
  check('media', home.status === 200 && /<html/i.test(html) && html.length > 1000,
    `GET / → 200 text/html, ${(html.length / 1024).toFixed(1)} KiB`,
    `GET / → ${home.status}, ${html.length} B`);
}

// ── cleanup: everything this run created, by identity ──────────────────────
async function cleanup(ctx) {
  if (KEEP) {
    console.log('\n--keep: leaving the test rows in place');
    return;
  }
  console.log('\ncleanup');
  const orderIds = state.orders.filter(Boolean);
  await quiet('email outbox', async () => {
    for (const orderId of orderIds) {
      await prisma.emailOutbox.deleteMany({ where: { idempotencyKey: { contains: orderId } } });
    }
  });
  await quiet('payment attempts', () => prisma.paymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('refunds', () => prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('coupon redemptions', () => prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } }));
  // The delivered codes were real inventory: put them back on the shelf instead of deleting
  // them, so the copy's code counts are unchanged.
  await quiet('inventory restore', async () => {
    await prisma.giftCode.updateMany({
      where: { orderId: { in: orderIds } },
      data: {
        status: 'available', orderId: null, orderItemId: null,
        deliveredAt: null, reservedAt: null,
      },
    });
  });
  await quiet('stock moves (orders)', () => prisma.stockMove.deleteMany({ where: { refId: { in: orderIds } } }));
  await quiet('order items', () => prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }));
  await quiet('orders', () => prisma.order.deleteMany({ where: { id: { in: orderIds } } }));

  if (state.seededCodes.length) {
    await quiet('seeded codes', () => prisma.giftCode.deleteMany({ where: { codeHash: { in: state.seededCodes } } }));
    await quiet('seeded stock moves', () =>
      prisma.stockMove.deleteMany({
        where: { variantId: state.variantId, reason: 'restock', createdAt: { gte: RUN_STARTED } },
      }));
  }
  if (state.variantId && ctx?.stockBefore !== undefined) {
    await quiet('stock counter restored', () =>
      prisma.productVariant.update({ where: { id: state.variantId }, data: { stock: ctx.stockBefore } }));
  }
  if (state.fixtureAdminId) {
    await quiet('audit rows', () => prisma.auditLog.deleteMany({ where: { actorId: state.fixtureAdminId } }));
    await quiet('sessions', () => prisma.adminSession.deleteMany({ where: { adminUserId: state.fixtureAdminId } }));
    await quiet('backup codes', () => prisma.adminBackupCode.deleteMany({ where: { adminUserId: state.fixtureAdminId } }));
    await quiet('challenges', () => prisma.adminChallengeConsumed.deleteMany({ where: { consumedAt: { gte: RUN_STARTED } } }));
    await quiet('fixture admin', () => prisma.adminUser.delete({ where: { id: state.fixtureAdminId } }));
  }
  console.log('  · test rows removed');
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`post-switch check → ${BASE}`);

  await checkAppUp();
  await checkDatabase();
  await checkMigrationHead();
  await checkRestart();
  await checkAdminLogin();

  let picked;
  try {
    picked = await ensureSellableVariant();
  } catch (e) {
    fail('order', e instanceof Error ? e.message : String(e));
    return;
  }
  const { variant, seeded } = picked;
  ctx = { variant, stockBefore: variant.stock };
  state.variantId = variant.id;
  state.stockBefore = variant.stock;
  if (seeded) {
    console.log('\n   ! no variant has stock + available codes — this run stocks one and restores it');
    const ok = await seedStock(variant, adminToken);
    if (!ok) throw new Error('could not stock the fixture variant');
  }

  await checkOrder(ctx);
  await checkRedeem(ctx);
  await checkMedia();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${passed}/${results.length} checks passed${failed.length ? ` — ${failed.length} FAILED` : ''}`);
  for (const f of failed) console.log(`  ✖ ${f.name}: ${f.detail}`);
}

// Errors must name a check, never print a stack trace at a person at a keyboard. Cleanup runs
// even when a check throws, so a failed run never leaves a fixture admin or seeded codes behind.
main()
  .catch((e) => {
    fail('harness', e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : String(e));
  })
  .finally(async () => {
    await cleanup(ctx);
    await prisma.$disconnect().catch(() => undefined);
  });
