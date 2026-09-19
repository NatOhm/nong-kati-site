/**
 * Admin auth E2E regression suite.
 * Drives the REAL API surface of a running dev server to execute the
 * admin-login-test.md checklist. Creates its own throwaway admin row and
 * cleans up after itself; prints PASS/FAIL per item with evidence.
 * Requires: dev server running (default http://127.0.0.1:4200) and
 * DATABASE_URL pointing at the target DB. Run against production at your
 * own risk — it briefly creates one admin row.
 * Run: node scripts/checklist-e2e.mjs [baseUrl]
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4200';
const prisma = new PrismaClient();

const EMAIL = `chk-${Date.now()}@nong-kati-test.local`;
const PASSWORD = 'Chk!Initial123';
const PASSWORD2 = 'Chk!Rotated456';
let passed = 0,
  failed = 0;
const results = [];

function check(name, cond, evidence = '') {
  if (cond) {
    passed++;
    results.push(`PASS ${name}${evidence ? ' — ' + evidence : ''}`);
  } else {
    failed++;
    results.push(`FAIL ${name}${evidence ? ' — ' + evidence : ''}`);
  }
}

// Minimal TOTP (RFC 6238) over base32 secret, mirroring src/lib/jwt.ts
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = A.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretB32, offsetSteps = 0) {
  const key = b32decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offsetSteps));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code =
    (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1000000;
  return String(code).padStart(6, '0');
}

async function api(path, opts = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  // ── §4.1-4.2: wrong password / unknown email ──────────────────
  const wrongPw = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: 'WrongPw!999' }),
  });
  check(
    '4.1 wrong password → 401 INVALID_CREDENTIALS',
    wrongPw.status === 401 && wrongPw.body.error === 'INVALID_CREDENTIALS',
    `status=${wrongPw.status}`,
  );

  const unknown = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ghost-xyz@nowhere.test', password: 'Whatever!123' }),
  });
  check(
    '4.2 unknown email → same 401 INVALID_CREDENTIALS (no enumeration)',
    unknown.status === 401 && unknown.body.error === 'INVALID_CREDENTIALS',
  );

  // Create throwaway admin directly in DB (never used for anything but this test)
  const { scrypt } = await import('node:crypto');
  const { promisify } = await import('node:util');
  const hashPw = promisify(scrypt);
  const saltBuf = Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex'); // must be hex-decoded like verifyPassword does
  const key = await hashPw(PASSWORD, saltBuf, 64);
  // Must match lib/password.ts format: scrypt$N$r$p$salt$hash
  const passwordHash = `scrypt$16384$8$1$a1b2c3d4e5f60718293a4b5c6d7e8f90$${key.toString('hex')}`;
  const admin = await prisma.adminUser.create({
    data: {
      email: EMAIL,
      fullName: 'Checklist Runner',
      role: 'super_admin',
      status: 'active',
      passwordHash,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      totpConfirmed: false, // force the setup path
    },
  });
  console.error(`[setup] created throwaway admin ${EMAIL}`);

  // ── §2 happy path: credentials → setup → verify ──────────────
  const step1 = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (step1.status !== 200)
    console.error('[debug] step1:', step1.status, JSON.stringify(step1.body));
  check(
    '2.1 login returns requires2faSetup + challengeToken',
    step1.status === 200 && step1.body.requires2faSetup === true && !!step1.body.challengeToken,
    `status=${step1.status}`,
  );

  const setup = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({ challengeToken: step1.body.challengeToken, action: 'setup' }),
  });
  check(
    '2.2 setup returns totpUri + secret + 10 backup codes',
    setup.status === 200 &&
      setup.body.success &&
      !!setup.body.totpUri &&
      !!setup.body.secretBase32 &&
      (setup.body.backupCodes || []).length === 10,
    `backupCodes=${(setup.body.backupCodes || []).length}`,
  );

  const code = await totp(setup.body.secretBase32);
  const step2 = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({ challengeToken: step1.body.challengeToken, code }),
  });
  check(
    '2.3 correct TOTP → 200 with access+refresh tokens',
    step2.status === 200 &&
      step2.body.success &&
      !!step2.body.accessToken &&
      !!step2.body.refreshToken,
    `expiresIn=${step2.body.expiresIn}`,
  );
  check('2.3b expiresIn = 900 (15 min)', step2.body.expiresIn === 900);

  // ── §3 silent refresh + rotation ──────────────────────────────
  const ACCESS = step2.body.accessToken;
  let REFRESH = step2.body.refreshToken;

  const me = await api('/api/v1/admin/products', {}, ACCESS);
  check(
    '3.1 admin API accepts access token → 200',
    me.status === 200,
    `status=${me.status} products=${(me.body.products || []).length}`,
  );

  const r1 = await api('/api/v1/auth/admin/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: REFRESH }),
  });
  check(
    '3.2 refresh returns new tokens',
    r1.status === 200 && !!r1.body.accessToken && !!r1.body.refreshToken,
    `status=${r1.status}`,
  );
  const REFRESH2 = r1.body.refreshToken;

  const r1reuse = await api('/api/v1/auth/admin/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: REFRESH }),
  });
  check(
    '3.3 reusing rotated refresh token → TOKEN_INVALID',
    r1reuse.status === 401 && r1reuse.body.error === 'TOKEN_INVALID',
    `status=${r1reuse.status}`,
  );

  const rGarbage = await api('/api/v1/auth/admin/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: 'garbage-token-xyz' }),
  });
  check('3.4 garbage refresh token → rejected', rGarbage.status === 401);

  const rForged = await api('/api/v1/admin/products', {}, ACCESS.slice(0, -4) + 'AAAA');
  check(
    '3.5 forged access token → 401/403',
    rForged.status === 401 || rForged.status === 403,
    `status=${rForged.status}`,
  );

  // ── §4.4 wrong TOTP / §4.5 challenge reuse ───────────────────
  const step1b = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const wrongTotp = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({ challengeToken: step1b.body.challengeToken, code: '000000' }),
  });
  check(
    '4.4 wrong TOTP → TOTP_INVALID',
    wrongTotp.status === 401 && wrongTotp.body.error === 'TOTP_INVALID',
    `status=${wrongTotp.status}`,
  );

  const reuseChallenge = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({
      challengeToken: step1.body.challengeToken,
      code: await totp(setup.body.secretBase32),
    }),
  });
  check(
    '4.5 consumed challenge reuse → TOKEN_INVALID (single-use)',
    reuseChallenge.status === 401 && reuseChallenge.body.error === 'TOKEN_INVALID',
    `status=${reuseChallenge.status}`,
  );

  // 2FA-setup step stays read-only (same challenge reused for setup+confirm pair):
  const setupAgain = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({ challengeToken: step1.body.challengeToken, action: 'setup' }),
  });
  check(
    '4.5b setup remains usable on the SAME challenge until confirm consumes it',
    setupAgain.status === 200 && !!setupAgain.body.secretBase32,
    `status=${setupAgain.status}`,
  );

  // ── §4.6 deactivated ─────────────────────────────────────────
  await prisma.adminUser.update({ where: { id: admin.id }, data: { status: 'deactivated' } });
  const deact = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check(
    '4.6 deactivated → ACCOUNT_DEACTIVATED',
    deact.status === 401 && deact.body.error === 'ACCOUNT_DEACTIVATED',
  );
  await prisma.adminUser.update({ where: { id: admin.id }, data: { status: 'active' } });

  // ── RBAC via limited roles ───────────────────────────────────
  // Stale lockout from earlier runs would fail the logins below — the doc's
  // own unlock SQL is part of the procedure, so apply it first.
  await prisma.adminUser.updateMany({
    where: { email: { in: ['catalogue@nong-kati.co.th', 'orders@nong-kati.co.th'] } },
    data: { status: 'active', lockedUntil: null, failedLoginAttempts: 0 },
  });

  // catalogue@: expects products 200 / orders 403
  const cat1 = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'catalogue@nong-kati.co.th',
      password: process.env.ADMIN_SEED_CATALOGUE_PASSWORD ?? 'catalogue123',
    }),
  });
  if (cat1.status === 200) {
    const catCode = await totp('JBSWY3DPEHPK3PXP');
    const cat2 = await api('/api/v1/auth/admin/2fa', {
      method: 'POST',
      body: JSON.stringify({ challengeToken: cat1.body.challengeToken, code: catCode }),
    });
    const catTok = cat2.body.accessToken;
    const prod = await api('/api/v1/admin/products', {}, catTok);
    const ords = await api('/api/v1/admin/orders', {}, catTok);
    check(
      '4b.1 catalogue: products 200 / orders 403',
      prod.status === 200 && ords.status === 403,
      `products=${prod.status} orders=${ords.status}`,
    );
    if (cat2.body.refreshToken) {
      const out = await api('/api/v1/auth/admin/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: cat2.body.refreshToken }),
      });
      check('4b.1b catalogue logout revokes', out.status === 200);
    }
  } else {
    check(
      '4b.1 catalogue login',
      false,
      `status=${cat1.status} body=${JSON.stringify(cat1.body).slice(0, 80)}`,
    );
  }

  // orders@: orders 200 / products 403
  const ord1 = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'orders@nong-kati.co.th',
      password: process.env.ADMIN_SEED_ORDERS_PASSWORD ?? 'orders123',
    }),
  });
  if (ord1.status === 200) {
    const ordCode = await totp('JBSWY3DPEHPK3PXP');
    const ord2 = await api(
      '/api/v1/auth/admin/2fa',
      { match: false } && {
        method: 'POST',
        body: JSON.stringify({ challengeToken: ord1.body.challengeToken, code: ordCode }),
      },
    );
    const ordTok = ord2.body.accessToken;
    const ords = await api('/api/v1/admin/orders', {}, ordTok);
    const prod = await api('/api/v1/admin/products', {}, ordTok);
    check(
      '4b.2 orders: orders 200 / products 403',
      ords.status === 200 && prod.status === 403,
      `orders=${ords.status} products=${prod.status}`,
    );
    if (ord2.body.refreshToken)
      await api('/api/v1/auth/admin/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: ord2.body.refreshToken }),
      });
  } else {
    check('4b.2 orders login', false, `status=${ord1.status}`);
  }

  // ── §8 SKU 409 + hide/show (super admin, re-login) ───────────
  const s1 = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const s2 = await api('/api/v1/auth/admin/2fa', {
    method: 'POST',
    body: JSON.stringify({
      challengeToken: s1.body.challengeToken,
      code: await totp('JBSWY3DPEHPK3PXP'),
    }),
  });
  const ADMIN = s2.body.accessToken;

  const prods = await api('/api/v1/admin/products', {}, ADMIN);
  const list = Array.isArray(prods.body) ? prods.body : prods.body.products || [];
  check('5.1 products page data: 37 DB products', list.length === 37, `count=${list.length}`);
  const target = list.find((p) => p.slug === 'bilibili-100') || list[list.length - 1];
  const victim = list.find((p) => p.id !== target.id && p.sku);
  const dupe = await api(
    `/api/v1/admin/products/${target.id}`,
    { method: 'PUT', body: JSON.stringify({ sku: victim.sku }) },
    ADMIN,
  );
  check(
    '8.1 duplicate SKU rejected with 409',
    dupe.status === 409,
    `status=${dupe.status} body=${JSON.stringify(dupe.body).slice(0, 80)}`,
  );

  const beforeRow = await api(`/api/v1/admin/products/${target.id}`, {}, ADMIN);
  const targetSku = beforeRow.body.sku;
  // Count href occurrences: when active the page shows the product card AND
  // possibly an admin announcement linking the same slug — hiding must drop
  // the count by exactly one (the card); the announcement, if any, stays.
  const hrefCount = (html) => html.split(`href="${cardHref}"`).length - 1;
  const cardHref = `/product/${target.slug}`;
  const before = hrefCount(
    await (await fetch(`${BASE}/search?q=${encodeURIComponent(target.name)}`)).text(),
  );
  const toggle = await api(
    `/api/v1/admin/products/${target.id}`,
    { method: 'PUT', body: JSON.stringify({ isActive: false }) },
    ADMIN,
  );
  const afterHide = hrefCount(
    await (await fetch(`${BASE}/search?q=${encodeURIComponent(target.name)}`)).text(),
  );
  check(
    '8.2 hide product → card gone from storefront',
    toggle.status === 200 && afterHide === before - 1,
    `toggle=${toggle.status} hrefs ${before}→${afterHide}`,
  );
  await api(
    `/api/v1/admin/products/${target.id}`,
    { method: 'PUT', body: JSON.stringify({ isActive: true }) },
    ADMIN,
  );
  const sf2 = await (await fetch(`${BASE}/search?q=${encodeURIComponent(target.name)}`)).text();
  check('8.3 unhide → card back on storefront', hrefCount(sf2) === before);

  // ── §8 change-password flow ──────────────────────────────────
  const wrongCur = await api(
    '/api/v1/auth/admin/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'Nope!99999999', newPassword: PASSWORD2 }),
    },
    ADMIN,
  );
  check(
    '8.4 change-password: wrong current rejected',
    wrongCur.status === 400 || wrongCur.status === 401,
    `status=${wrongCur.status}`,
  );
  const tooShort = await api(
    '/api/v1/auth/admin/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'short1!' }) },
    ADMIN,
  );
  check(
    '8.5 change-password: <12 chars rejected',
    tooShort.status === 400,
    `status=${tooShort.status}`,
  );
  const cp = await api(
    '/api/v1/auth/admin/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: PASSWORD2 }) },
    ADMIN,
  );
  check(
    '8.6 change-password success',
    cp.status === 200,
    `status=${cp.status} body=${JSON.stringify(cp.body).slice(0, 60)}`,
  );

  const oldPw = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check('8.7 old password rejected after change', oldPw.status === 401);
  const newPw = await api('/api/v1/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD2 }),
  });
  check('8.8 new password works', newPw.status === 200 && !!newPw.body.challengeToken);
  // Password change revokes SESSIONS (refresh tokens), not the stateless
  // 15-min access JWT — assert the refresh-token revocation that IS the contract.
  const rev = await api('/api/v1/auth/admin/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: REFRESH2 }),
  });
  check(
    '8.9 refresh sessions revoked after password change',
    rev.status === 401,
    `status=${rev.status}`,
  );

  // ── cleanup ──────────────────────────────────────────────────
  await prisma.adminSession.deleteMany({ where: { adminUserId: admin.id } });
  await prisma.adminUser.delete({ where: { id: admin.id } });
  console.error(`[cleanup] removed throwaway admin ${EMAIL}`);

  console.log(results.join('\n'));
  console.log(`\n== ${passed} passed, ${failed} failed ==`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error('fatal:', e.message, '\n', e.stack?.split('\n').slice(0, 4).join('\n'));
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
