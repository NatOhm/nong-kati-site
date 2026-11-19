/**
 * Seed the smoke-test environment (CI browser-smoke job).
 *
 * 1. Runs `prisma db seed` — the real catalog seed (upsert-based, idempotent)
 *    so the storefront has products to render and sell.
 * 2. Upserts the `manual-transfer` SiteSetting so the checkout payment gate
 *    has a usable channel without any Opn keys in the environment (the
 *    production build fails closed on NK_PAYMENT_MOCK, by design).
 * 3. Echoes GIT_SHA/GIT_REF for the deploy-shape assertions.
 *
 * DB access goes through the Prisma client only (same DATABASE_URL as the
 * server under test) — no psql dependency on the runner.
 *
 * Run: npx tsx scripts/seed-smoke.mjs   (it imports src/lib/crypto/giftCode.ts)
 */

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { encryptCode, hashCode } from '../src/lib/crypto/giftCode.ts';

/** Codes the smoke variant needs before the checkout test can buy one. */
const SMOKE_CODES = 10;

const MANUAL_TRANSFER = {
  enabled: true,
  accountName: 'บริษัท น้องคะติ้ง จำกัด (สโมคทดสอบ)',
  accountNumber: '0812345678',
  accountType: 'promptpay',
  bankName: null,
  qrImageUrl: null,
};

async function main() {
  // 1. Catalog — the real seed (idempotent upserts, 38 products).
  console.log('[smoke-seed] running prisma db seed…');
  execSync('npx prisma db seed', { stdio: 'inherit' });

  // 2. Manual-transfer payment channel (site settings are JSON blobs).
  const prisma = new PrismaClient();
  try {
    await prisma.siteSetting.upsert({
      where: { key: 'manual-transfer' },
      update: { value: JSON.stringify(MANUAL_TRANSFER) },
      create: { key: 'manual-transfer', value: JSON.stringify(MANUAL_TRANSFER) },
    });
    console.log('[smoke-seed] manual-transfer setting upserted ✔');

    const counts = {
      products: await prisma.product.count({ where: { isActive: true } }),
      variants: await prisma.productVariant.count({ where: { isActive: true } }),
    };
    if (counts.products === 0 || counts.variants === 0) {
      throw new Error('catalog is empty after seeding — aborting smoke run');
    }
    console.log(
      `[smoke-seed] catalog: ${counts.products} products / ${counts.variants} variants ✔`,
    );

    // Id formula from prisma/seed.ts: Thai chars are stripped to dashes.
    const smokeVariantId = 'hbo-max-7-4k-7-----4k---4-';
    const variant = await prisma.productVariant.findUnique({
      where: { id: smokeVariantId },
      select: { id: true, price: true, stock: true },
    });
    if (!variant) throw new Error(`expected smoke variant ${smokeVariantId} missing`);

    // Stock is not sellable on its own: src/lib/promotions.ts gates every line
    // on min(stock, available gift codes) — "Sell only units that gift codes
    // can actually deliver" (391c376). Without codes this variant is sold out
    // however high `stock` reads, and seed-management-smoke parks an unpaid
    // order that holds a unit on top of that, so one code was starving the
    // checkout test in all three browser projects. Top the codes up to the
    // smoke stock instead of touching the gate.
    const existingCodes = await prisma.giftCode.count({
      where: { variantId: smokeVariantId, status: 'available' },
    });
    const missing = Math.max(0, SMOKE_CODES - existingCodes);
    if (missing > 0) {
      const data = Array.from({ length: missing }, (_, i) => {
        const plain = `SMOKE-${Date.now().toString(36).toUpperCase()}-${i}`;
        const { ciphertext, nonce } = encryptCode(plain);
        return {
          variantId: smokeVariantId,
          codeEncrypted: ciphertext,
          nonce,
          codeHash: hashCode(plain),
          status: 'available',
        };
      });
      await prisma.giftCode.createMany({ data });
    }
    const availableCodes = await prisma.giftCode.count({
      where: { variantId: smokeVariantId, status: 'available' },
    });
    console.log(
      `[smoke-seed] smoke variant ok (฿${variant.price}, stock ${variant.stock}, ${availableCodes} available codes) ✔`,
    );
  } finally {
    await prisma.$disconnect();
  }

  // 3. Deploy shape the smoke suite asserts against.
  const sha = process.env.GIT_SHA ?? '(unset)';
  const ref = process.env.GIT_REF ?? '(unset)';
  console.log(`[smoke-seed] deploy shape: sha=${sha} ref=${ref}`);
}

main().catch((err) => {
  console.error('[smoke-seed] FAILED:', err);
  process.exit(1);
});
