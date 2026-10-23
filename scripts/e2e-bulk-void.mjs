// Real end-to-end check for Phase 2 (run against a local `next dev` + the
// docker Postgres the dev DB points at):
//   login (password+TOTP) -> bulk paste upload -> stock-history chip carries
//   the batch refId -> bulk-void the batch -> DB asserts (codes voided,
//   stock restored, paired ±N StockMove rows on the same refId).
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'MgmtSmoke!2026x';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP'; // seed-management-smoke.mjs fixture

const prisma = new PrismaClient();

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

// RFC 6238 TOTP (30s step, SHA-1, 6 digits) — same scheme as e2e/helpers.ts.
function totp(secretB32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secretB32.replace(/=+$/, '').replace(/ /g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin =
    ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

async function login(email, password) {
  const step1 = await fetch(`${BASE}/api/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const t1 = await step1.text();
  assert(step1.ok, `login step1 status ${step1.status}: ${t1}`);
  const s1 = JSON.parse(t1);
  assert(s1.challengeToken, `login step1 no challengeToken: ${JSON.stringify(s1)}`);

  const step2 = await fetch(`${BASE}/api/v1/auth/admin/2fa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ challengeToken: s1.challengeToken, code: totp(TOTP_SECRET) }),
  });
  const s2 = await step2.json().catch(() => ({}));
  assert(step2.ok && s2.success !== false && s2.accessToken,
    `login 2fa failed status ${step2.status}: ${JSON.stringify(s2)}`);
  return s2.accessToken;
}

async function main() {
  const startedAt = new Date(Date.now() - 60_000); // rows written during this run

  // Fixture super-admin created by scripts/seed-management-smoke.mjs.
  const admin = await prisma.adminUser.findFirst({
    where: { role: 'super_admin', status: 'active', totpSecret: TOTP_SECRET },
    select: { email: true },
  });
  assert(admin, 'smoke super-admin not found — run scripts/seed-management-smoke.mjs first');

  // Product + a single active variant to pin the paste to (bulk round-robins
  // across a multi-variant product unless variantId is given).
  const product = await prisma.product.findFirst({
    where: { isActive: true, variants: { some: { isActive: true } } },
    include: { variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  });
  assert(product, 'no active product with variants — did the base catalog seed run?');
  const variant = product.variants[0];
  assert(variant, 'product has no active variant');

  const token = await login(admin.email, PASSWORD);
  console.log('logged in as', admin.email);

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    origin: BASE,
  };

  const before = await prisma.productVariant.findUnique({
    where: { id: variant.id }, select: { stock: true },
  });

  // --- 1) Bulk paste upload (the "bad paste" we will undo) -----------------
  const stamp = Date.now().toString(36).toUpperCase();
  const paste = Array.from({ length: 4 }, (_, i) =>
    `E2E${stamp}${i}CLIENTACCOUNT`,
  ).join('\n');
  const upload = await fetch(`${BASE}/api/v1/admin/stock/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: product.id,
      variantId: variant.id,
      format: 'short',
      separator: 'newline',
      raw: paste,
      apply: true,
    }),
  });
  const tUp = await upload.text();
  assert(upload.ok, `bulk upload status ${upload.status}: ${tUp}`);
  const up = JSON.parse(tUp);
  assert(up.results?.length === 1, `expected 1 variant plan: ${JSON.stringify(up)}`);
  const { batchId, added } = up.results[0];
  assert(batchId, `no batchId in results: ${JSON.stringify(up)}`);
  assert(added === 4 && up.totalAdded === 4,
    `expected 4 codes created, got added=${added} total=${up.totalAdded}`);

  const after = await prisma.productVariant.findUnique({
    where: { id: variant.id }, select: { stock: true },
  });
  assert(after.stock === before.stock + 4,
    `stock did not grow by 4: ${before.stock} -> ${after.stock}`);
  console.log(`uploaded batch ${batchId} (+4 stock, now ${after.stock})`);

  // --- 2) chip: stock history shows the batch row with refId ---------------
  const list = await fetch(`${BASE}/api/v1/admin/inventory`, { headers });
  assert(list.ok, `inventory GET status ${list.status}`);
  const inv = await list.json();
  const chipRow = inv.moves.find((m) => m.refId === batchId);
  assert(chipRow, `stock history has no row carrying refId=${batchId}`);
  assert(chipRow.delta === 4 && chipRow.reason === 'restock',
    `chip row wrong: delta=${chipRow.delta} reason=${chipRow.reason}`);
  console.log('history chip shows', { id: chipRow.id, refId: chipRow.refId, delta: chipRow.delta });

  // --- 3) Bulk-void the whole batch (the undo) ----------------------------
  const voidRes = await fetch(`${BASE}/api/v1/admin/stock/bulk-void`, {
    method: 'POST', headers,
    body: JSON.stringify({ batchId, reason: 'pasted wrong list, undoing' }),
  });
  const tVoid = await voidRes.text();
  assert(voidRes.ok, `bulk-void status ${voidRes.status}: ${tVoid}`);
  const vd = JSON.parse(tVoid);
  assert(vd.voided === 4, `expected 4 voided, got ${JSON.stringify(vd)}`);

  // Idempotency: a second void flips nothing (CAS on available).
  const again = await fetch(`${BASE}/api/v1/admin/stock/bulk-void`, {
    method: 'POST', headers,
    body: JSON.stringify({ batchId, reason: 'double click' }),
  });
  const vd2 = await again.json();
  assert(again.ok && vd2.voided === 0,
    `re-void should flip 0, got status ${again.status} ${JSON.stringify(vd2)}`);
  console.log('re-void is a no-op (voided=0)');

  // --- 4) DB asserts: codes voided, stock restored, paired moves ----------
  const codes = await prisma.giftCode.findMany({ where: { uploadBatchId: batchId } });
  assert(codes.length === 4, `expected 4 codes in batch, got ${codes.length}`);
  assert(codes.every((c) => c.status === 'voided'),
    `not all voided: ${codes.map((c) => c.status)}`);
  assert(codes.every((c) => c.voidedById && c.voidedAt && c.voidReason),
    'voided codes missing who/why/when');

  const end = await prisma.productVariant.findUnique({
    where: { id: variant.id }, select: { stock: true },
  });
  assert(end.stock === before.stock,
    `stock should be back to ${before.stock}, is ${end.stock}`);

  const moves = await prisma.stockMove.findMany({
    where: { refId: batchId }, orderBy: { createdAt: 'asc' },
  });
  assert(moves.length === 2, `expected 2 moves (paste + undo), got ${moves.length}`);
  assert(moves[0].delta === 4 && moves[1].delta === -4,
    `deltas wrong: ${moves.map((m) => m.delta)}`);
  assert(moves.every((m) => m.actorId), 'a batch move is missing actorId');
  console.log('moves assert:', moves.map((m) => ({ reason: m.reason, delta: m.delta, refId: m.refId })));

  // Audit rows both carry the batch id (correlation on restock audit rows).
  // metadata is Json, so match it in JS rather than with a Prisma filter.
  const audits = await prisma.auditLog.findMany({
    where: { action: { in: ['inventory.restock', 'inventory.bulk_void'] }, createdAt: { gte: startedAt } },
    select: { action: true, recordId: true, metadata: true },
  });
  const restockRow = audits.find((a) =>
    a.action === 'inventory.restock' && JSON.stringify(a.metadata ?? {}).includes(batchId));
  const voidRow = audits.find((a) =>
    a.action === 'inventory.bulk_void' && a.recordId === batchId);
  assert(restockRow, `no restock audit row carrying batchId ${batchId}`);
  assert(voidRow, `no bulk-void audit row for recordId ${batchId}`);
  console.log('audit rows correlated:', [restockRow.action, voidRow.action]);

  console.log('E2E OK — paste -> chip -> bulk-void -> db all consistent');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
