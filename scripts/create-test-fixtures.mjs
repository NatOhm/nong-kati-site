#!/usr/bin/env node
/**
 * Create test fixtures for the account-import dialog (BulkStockDialog)
 * Creates a product "Test" with a few variants so it can be tested end-to-end
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

function loadEnv() {
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
      /* ignore */
    }
  }
}

loadEnv();

let dbUrl = process.env['DATABASE_DIRECT_URL'] || process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  try {
    // Ensure category exists
    const category = await prisma.category.upsert({
      where: { slug: 'test' },
      update: {},
      create: {
        slug: 'test',
        name: 'ทดสอบ',
        icon: 'TestTube',
        sortOrder: 999,
      },
    });

    // Create test product
    const product = await prisma.product.upsert({
      where: { slug: 'test-fixture' },
      update: {
        name: 'Test',
        isActive: true,
      },
      create: {
        slug: 'test-fixture',
        name: 'Test',
        description: 'สินค้าทดสอบสำหรับทดสอบฟีเจอร์',
        categoryId: category.id,
        isActive: true,
      },
    });

    // Create variants
    const variants = [
      { label: '7 วัน', price: 25 },
      { label: '30 วัน', price: 80 },
    ];

    for (const v of variants) {
      const variantId = `test-fixture-${v.label.replace(/\s/g, '-')}`;
      await prisma.productVariant.upsert({
        where: { id: variantId },
        update: {
          label: v.label,
          price: v.price,
          isActive: true,
        },
        create: {
          id: variantId,
          productId: product.id,
          label: v.label,
          price: v.price,
          stock: 0,
          isActive: true,
          sortOrder: variants.indexOf(v),
        },
      });
      console.log(`✓ Created variant: ${v.label}`);
    }

    console.log(`\n✓ Created test product: ${product.name} (ID: ${product.id})`);
    console.log('Product has variants - BulkStockDialog can now be tested');
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
