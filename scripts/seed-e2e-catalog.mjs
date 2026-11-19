#!/usr/bin/env node
/**
 * Restore the catalog fixtures the browser specs name explicitly:
 * `hbo-max-7-4k-4` ("HBO Max 7 วัน 4K", home/search assertions) and
 * `hbo-max-7-4k` (the smoke checkout walk). The local/dev database had them
 * purged, so those specs failed for a missing row rather than for anything
 * they test, on BOTH engines.
 *
 * Stock on the product page is the count of *available gift codes*, not the
 * `ProductVariant.stock` column (see getProductBySlug → _count.giftCodes), so
 * a variant with the column at 5 and no codes still renders "สินค้าหมด" and
 * never shows the add-to-cart button. This seeds encrypted codes and keeps the
 * column in step with them.
 *
 * Idempotent: upserts by slug and only tops codes up when they are missing.
 * Run: npx tsx scripts/seed-e2e-catalog.mjs   (it imports a .ts module)
 */
import { PrismaClient } from '@prisma/client';
import { encryptCode, hashCode } from '../src/lib/crypto/giftCode.ts';

const p = new PrismaClient();

const PRODUCT = {
  name: 'HBO Max 7 วัน 4K',
  slug: 'hbo-max-7-4k-4',
  sku: 'E2E-HBO-74K4',
  shortDescription: 'fixture for the browser suite',
  isActive: true,
  isFeatured: true,
};

const VARIANTS = [
  { label: '1 วัน', price: 25, sortOrder: 0 },
  { label: '7 วัน 4K (÷4)', price: 89, sortOrder: 1 },
  { label: '30 วัน', price: 219, sortOrder: 2 },
  { label: '1 เดือน', price: 249, sortOrder: 3 },
];

const CODES_PER_VARIANT = 5;

async function ensureCodes(variantId, want = CODES_PER_VARIANT) {
  const have = await p.giftCode.count({ where: { variantId, status: 'available' } });
  if (have < want) {
    const data = [];
    for (let i = have; i < want; i++) {
      const plain = `E2E-${variantId.slice(-6)}-${Date.now().toString(36)}-${i}`.toUpperCase();
      const { ciphertext, nonce } = encryptCode(plain);
      data.push({
        variantId,
        codeEncrypted: ciphertext,
        nonce,
        codeHash: hashCode(plain),
        status: 'available',
      });
    }
    await p.giftCode.createMany({ data });
  }
  return p.giftCode.count({ where: { variantId, status: 'available' } });
}

async function syncStock(variantId) {
  const available = await ensureCodes(variantId);
  await p.productVariant.update({
    where: { id: variantId },
    data: { stock: available, isActive: true },
  });
  return available;
}

try {
  const category =
    (await p.category.findFirst({ where: { slug: 'movie-series' } })) ??
    (await p.category.create({
      data: { name: 'หนัง & ซีรีส์', slug: 'movie-series', sortOrder: 1 },
    }));

  const product = await p.product.upsert({
    where: { slug: PRODUCT.slug },
    update: { ...PRODUCT, categoryId: category.id },
    create: { ...PRODUCT, categoryId: category.id },
  });

  for (const v of VARIANTS) {
    const existing = await p.productVariant.findFirst({
      where: { productId: product.id, label: v.label },
    });
    const variant =
      existing ??
      (await p.productVariant.create({
        data: { productId: product.id, label: v.label, price: v.price, sortOrder: v.sortOrder },
      }));
    await syncStock(variant.id);
  }

  console.log(`fixture ready: ${PRODUCT.slug} (${product.id})`);

  // Second slug the smoke checkout spec walks (`/product/hbo-max-7-4k`).
  const second = await p.product.upsert({
    where: { slug: 'hbo-max-7-4k' },
    update: { isActive: true, categoryId: category.id },
    create: {
      name: 'HBO Max 7 วัน 4K',
      slug: 'hbo-max-7-4k',
      sku: 'E2E-HBO-74K',
      shortDescription: 'fixture for the browser suite',
      isActive: true,
      isFeatured: false,
      categoryId: category.id,
    },
  });
  const secondVariant =
    (await p.productVariant.findFirst({ where: { productId: second.id } })) ??
    (await p.productVariant.create({
      data: { productId: second.id, label: '7 วัน 4K', price: 89, sortOrder: 0 },
    }));
  const secondStock = await syncStock(secondVariant.id);
  console.log(`fixture ready: ${second.slug} (${second.id}) stock=${secondStock}`);
} finally {
  await p.$disconnect();
}
