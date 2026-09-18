/**
 * E2E: seed 5 encrypted gift codes onto the Prime Video variant so the
 * purchase flow can be proven. Run: node scripts/seed-test-codes.mjs
 * (NK_GIFT_CODE_ENCRYPTION_KEY must be set — the app throws without it.)
 */
import { PrismaClient } from '@prisma/client';
import { encryptCode, hashCode } from '../src/lib/crypto/giftCode.ts';

const p = new PrismaClient();
try {
  const v = await p.productVariant.findFirst({
    where: { product: { name: { contains: 'Prime Video' } } },
  });
  if (!v) throw new Error('no Prime Video variant');

  const codes = [];
  for (let i = 0; i < 5; i++) {
    const plain = `TEST-${Date.now().toString(36).toUpperCase()}-${i}`;
    const { ciphertext, nonce } = encryptCode(plain);
    codes.push({
      variantId: v.id,
      codeEncrypted: ciphertext,
      nonce,
      codeHash: hashCode(plain),
      status: 'available',
    });
  }
  await p.giftCode.createMany({ data: codes });
  const updated = await p.productVariant.update({
    where: { id: v.id },
    data: { stock: { increment: 5 } },
    select: { stock: true },
  });
  await p.stockMove.create({
    data: {
      variantId: v.id,
      delta: 5,
      reason: 'restock',
      refType: 'test',
      note: 'seed codes for E2E test',
      stockAfter: updated.stock,
      actorType: 'admin',
    },
  });
  console.log(JSON.stringify({ variantId: v.id, stock: updated.stock, seeded: 5 }));
  await p.$disconnect();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
