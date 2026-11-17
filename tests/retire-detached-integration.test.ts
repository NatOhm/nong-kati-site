/**
 * The detached-code retire, against a REAL MariaDB — not a prisma double.
 *
 * `tests/admin-stored-accounts.test.ts` proves what the handler *passes* to the
 * data layer. It cannot prove the database agrees: that `voidedById` survives
 * as a column, that the audit row lands in the same transaction, or that no
 * `StockMove` row exists afterwards. This suite does that — it seeds a
 * detached `available` GiftCode, calls the real `PATCH …/codes/:id/void`
 * handler, and then reads the result back in SQL.
 *
 * SAFETY: skips unless `DATABASE_URL` is a loopback MySQL/MariaDB
 * (`127.0.0.1` / `localhost`). Production is unreachable by construction; the
 * `NK_*` cookie secret below is a test constant, never a deployed one.
 *
 * The fixture is a *grandfathered* row on purpose: the guard added in
 * `20261117093000_giftcode_available_requires_variant` refuses to create
 * `available` + `variantId IS NULL` any more, so the triggers are dropped for
 * the insert and re-applied from the migration's own SQL before the handler
 * runs. That is exactly the state production is in (13 legacy rows, guards
 * already active).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['NK_JWT_SECRET'] = 'retire-itest-secret-0123456789abcdef0123456789';
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] = 'c'.repeat(64);

const RAW_URL = process.env['DATABASE_URL'] ?? '';
const LOOPBACK = /^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//i;
const RUNNABLE = LOOPBACK.test(RAW_URL);

const MIGRATION = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20261117093000_giftcode_available_requires_variant',
  'migration.sql',
);
const PRISMA_CLI = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

/** DDL goes through the migration engine: CREATE/DROP TRIGGER are refused by
 *  the prepared-statement protocol the client uses (MariaDB error 1295). */
const ddl = (sql: string): void => {
  execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', RAW_URL, '--stdin'], {
    input: sql,
    env: process.env,
    stdio: 'pipe',
  });
};

const TAG = 'itest_retire';

describe.runIf(RUNNABLE)('detached retire — against a real database', () => {
  let db: PrismaClient;
  let detachedId = '';
  let attachedId = '';
  let variantId = '';
  let orderCountBefore = 0;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

    // Fresh scratch database? Apply the schema with the project's own tool.
    const probe = await db.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'GiftCode'",
    );
    if (Number(probe[0]?.n ?? 0) === 0) {
      execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_DIRECT_URL: RAW_URL },
        stdio: 'pipe',
      });
    }

    const { encryptCode, hashCode } = await import('@/lib/crypto/giftCode');
    const make = (plain: string) => {
      const { ciphertext, nonce, keyVersion } = encryptCode(plain);
      return { codeEncrypted: ciphertext, codeHash: hashCode(plain), nonce, keyVersion };
    };

    const stamp = Date.now();
    const category = await db.category.create({
      data: { id: `${TAG}_cat_${stamp}`, name: 'Test category', slug: `${TAG}-${stamp}` },
    });
    const product = await db.product.create({
      data: {
        id: `${TAG}_prod_${stamp}`,
        name: 'Retire fixture',
        slug: `${TAG}-${stamp}`,
        categoryId: category.id,
      },
    });
    const variant = await db.productVariant.create({
      data: { id: `${TAG}_var_${stamp}`, productId: product.id, label: '30 วัน', price: '107.00', stock: 5 },
    });
    variantId = variant.id;

    await db.adminUser.create({
      data: {
        id: `${TAG}_admin`,
        email: `${TAG}@test.local`,
        fullName: 'Retire Fixture Admin',
        role: 'super_admin',
        status: 'active',
        passwordHash: 'scrypt$1$1$1$salt$hash',
      },
    });

    // The legacy row: available, no variant — created with the guard lifted.
    ddl('DROP TRIGGER IF EXISTS `GiftCode_available_requires_variant_ins`');
    ddl('DROP TRIGGER IF EXISTS `GiftCode_available_requires_variant_upd`');
    const detached = await db.giftCode.create({
      data: { id: `${TAG}_code_detached`, variantId: null, status: 'available', ...make('USER:PASS-detached') },
    });
    const attached = await db.giftCode.create({
      data: { id: `${TAG}_code_attached`, variantId: variant.id, status: 'available', ...make('USER:PASS-attached') },
    });
    detachedId = detached.id;
    attachedId = attached.id;

    // Guards back on, from the migration's own text — the handler now runs
    // under exactly the constraints production has.
    ddl(readFileSync(MIGRATION, 'utf8'));

    orderCountBefore = await db.stockMove.count();
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { recordId: { in: [detachedId, attachedId] } } });
    await db.stockMove.deleteMany({ where: { variantId } });
    await db.giftCode.deleteMany({ where: { id: { in: [detachedId, attachedId] } } });
    await db.productVariant.deleteMany({ where: { id: variantId } });
    await db.product.deleteMany({ where: { id: { startsWith: TAG } } });
    await db.category.deleteMany({ where: { id: { startsWith: TAG } } });
    await db.adminUser.deleteMany({ where: { id: { startsWith: TAG } } });
    await db.$disconnect();
  }, 60_000);

  /** Call the route handler exactly as the admin UI does. */
  const retire = async (id: string): Promise<Response> => {
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { ALL_PERMISSIONS } = await import('@/types/auth');
    const token = await issueAdminJwt(`${TAG}_admin`, `${TAG}@test.local`, 'super_admin', [
      ...ALL_PERMISSIONS,
    ]);
    const route = (await import(
      /* @vite-ignore */ '../src/app/api/v1/admin/inventory/codes/[id]/void/route'
    )) as { PATCH: (r: NextRequest, c: unknown) => Promise<Response> };
    return route.PATCH(
      new NextRequest('http://localhost/api/v1/admin/inventory/codes/' + id + '/void', {
        method: 'PATCH',
        headers: { cookie: `nk_admin_at=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'โค้ดไม่มีสินค้า (itest)' }),
      }),
      { params: Promise.resolve({ id }) },
    );
  };

  it('retires a detached code: status voided, audit row written, no stock moved', async () => {
    const res = await retire(detachedId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { detached?: boolean }).toMatchObject({ detached: true });

    // 1. the row, read back in SQL
    const [row] = await db.$queryRawUnsafe<
      Array<{ status: string; voidedById: string | null; voidReason: string | null; voidedAt: Date | null }>
    >('SELECT `status`, `voidedById`, `voidReason`, `voidedAt` FROM `GiftCode` WHERE `id` = ?', detachedId);
    expect(row?.status).toBe('voided');
    expect(row?.voidedById).toBe(`${TAG}_admin`);
    expect(row?.voidReason).toBe('โค้ดไม่มีสินค้า (itest)');
    expect(row?.voidedAt).toBeInstanceOf(Date);

    // 2. the trail, in the same table the audit screen reads
    const [audit] = await db.$queryRawUnsafe<
      Array<{ action: string; tableName: string; metadata: string | null }>
    >(
      'SELECT `action`, `tableName`, `metadata` FROM `AuditLog` WHERE `recordId` = ? ORDER BY `createdAt` DESC LIMIT 1',
      detachedId,
    );
    expect(audit?.action).toBe('inventory.code_void');
    expect(audit?.tableName).toBe('GiftCode');
    const meta = JSON.parse(audit?.metadata ?? '{}') as Record<string, unknown>;
    expect(meta['detached']).toBe(true);
    expect(meta['variantId']).toBeNull();

    // 3. NO stock side effects — the whole reason this branch exists
    expect(await db.stockMove.count({ where: { variantId } })).toBe(0);
    expect(await db.stockMove.count()).toBe(orderCountBefore);
    const [variantRow] = await db.$queryRawUnsafe<Array<{ stock: number }>>(
      'SELECT `stock` FROM `ProductVariant` WHERE `id` = ?',
      variantId,
    );
    expect(Number(variantRow?.stock)).toBe(5);
  }, 60_000);

  it('still moves stock for an ATTACHED code — the branch did not disable the real void', async () => {
    const res = await retire(attachedId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { detached?: boolean }).not.toMatchObject({ detached: true });

    const moves = await db.stockMove.findMany({ where: { variantId }, select: { delta: true, reason: true } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ delta: -1, reason: 'void' });

    const [variantRow] = await db.$queryRawUnsafe<Array<{ stock: number }>>(
      'SELECT `stock` FROM `ProductVariant` WHERE `id` = ?',
      variantId,
    );
    expect(Number(variantRow?.stock)).toBe(4);

    const [audit] = await db.$queryRawUnsafe<Array<{ metadata: string | null }>>(
      'SELECT `metadata` FROM `AuditLog` WHERE `recordId` = ? ORDER BY `createdAt` DESC LIMIT 1',
      attachedId,
    );
    expect((JSON.parse(audit?.metadata ?? '{}') as Record<string, unknown>)['detached']).toBe(false);
  }, 60_000);
});
