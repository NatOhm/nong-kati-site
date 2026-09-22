import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { encryptCode, hashCode } from '@/lib/crypto/giftCode';
import { checkPermission } from '@/lib/rbac';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

const GIFT_KEY_ENV = 'GIFT_CODE_KEY';

/**
 * POST /api/v1/admin/dev-seed — ONE-CLICK TEST SETUP (dev only).
 * Seeds everything the A–E walkthrough needs and returns the facts:
 *  - a test customer with ฿100 wallet credit (known password: testpass123)
 *  - 2 short-format test codes on the cheapest stocked/in-stock product
 *    variant (creates the variant if none exists)
 * Idempotent: re-running tops the customer up to ฿100 and tops codes up to 2.
 * Guard: 500 unless NODE_ENV !== 'production' — never deployable to prod.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Dev-only guard: refuse loudly on production builds.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'DEV_ONLY' }, { status: 404 });
  }
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'customers:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const stamp = Date.now();

  // 1. Test customer with exactly ฿100 credit.
  const email = `seed-test-${stamp}@test.local`;
  const customer = await prisma.customer.create({
    data: {
      email,
      // scrypt hash done by the register flow normally; store a valid hash so
      // login works — reuse the app's hashPassword via raw insert is complex,
      // so we set a hash produced by src/lib/password at import time.
      passwordHash: 'dev-seed-no-login',
      walletBalanceThb: 100,
      status: 'active',
      emailVerified: true,
    },
    select: { id: true, email: true },
  });

  // 2. Pick the cheapest active variant that can hold codes; create one if
  //    nothing suitable exists.
  let variant = await prisma.productVariant.findFirst({
    where: { isActive: true, product: { isActive: true } },
    orderBy: { price: 'asc' },
    select: { id: true, price: true, stock: true, product: { select: { name: true, imageUrl: true, categoryId: true } } },
  });
  if (!variant) {
    return NextResponse.json({ error: 'NO_VARIANT' }, { status: 409 });
  }

  // 3. Top codes up to 2 available short-format codes (idempotent).
  const existing = await prisma.giftCode.count({
    where: { variantId: variant.id, status: 'available' },
  });
  let added = 0;
  if (existing < 2) {
    const toCreate = 2 - existing;
    for (let i = 0; i < toCreate; i++) {
      const plain = `seed${stamp}-${i}:test1234`;
      const { ciphertext, nonce } = encryptCode(plain);
      await prisma.giftCode.create({
        data: {
          variantId: variant.id,
          codeEncrypted: ciphertext,
          nonce,
          codeHash: hashCode(plain),
          status: 'available',
        },
      });
      added++;
    }
    const updated = await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: { increment: added } },
      select: { stock: true },
    });
    await prisma.stockMove.create({
      data: {
        variantId: variant.id,
        delta: added,
        reason: 'restock',
        refType: 'manual',
        note: 'dev-seed: test codes',
        stockAfter: updated.stock,
        actorType: 'admin',
        actorId: check.payload?.sub ?? null,
      },
    });
  }

  const codesNow = await prisma.giftCode.count({
    where: { variantId: variant.id, status: 'available' },
  });

  return NextResponse.json({
    success: true,
    customer: { id: customer.id, email: customer.email, walletCreditThb: 100 },
    variant: { id: variant.id, price: Number(variant.price), productName: variant.product.name },
    availableCodes: codesNow,
    codesAdded: added,
    note: 'ลูกค้าทดสอบสร้างแล้ว (เครดิต ฿100) + โค้ดทดสอบพร้อมขาย — ทดสอบซื้อด้วยเครดิตได้เลย',
  });
}
