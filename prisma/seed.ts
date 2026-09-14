/**
 * Database Seed Script — Real products from nongkatistore.com
 * 38 products across 13 categories
 *
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with nongkatistore.com products...\n');

  // ─── Categories ─────────────────────────────────────
  console.log('📁 Seeding categories...');
  const categories = [
    // Level 1 — Main categories
    { id: 'cat-streaming', parentId: null, slug: 'streaming', name: 'สตรีมมิ่ง', icon: 'Tv', sortOrder: 1 },
    { id: 'cat-music', parentId: null, slug: 'music', name: 'เพลง', icon: 'Music', sortOrder: 2 },
    { id: 'cat-tools', parentId: null, slug: 'tools', name: 'เครื่องมือ', icon: 'Wrench', sortOrder: 3 },
    { id: 'cat-editing', parentId: null, slug: 'editing', name: 'ตัดต่อ', icon: 'Scissors', sortOrder: 4 },

    // Level 2 — Streaming sub-categories
    { id: 'cat-video-streaming', parentId: 'cat-streaming', slug: 'video-streaming', name: 'วิดีโอสตรีมมิ่ง', icon: 'Play', sortOrder: 1 },
    { id: 'cat-asian-streaming', parentId: 'cat-streaming', slug: 'asian-streaming', name: 'สตรีมมิ่งเอเชีย', icon: 'Globe', sortOrder: 2 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder, parentId: cat.parentId },
      create: { id: cat.id, slug: cat.slug, name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder, parentId: cat.parentId },
    });
  }
  console.log(`  ✅ ${categories.length} categories`);

  // ─── Products & Variants ────────────────────────────
  console.log('📦 Seeding products...');

  const products = [
    // ═══════════════════════════════════════════════════
    // HBO MAX (4 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'hbo-max-7-4k', name: 'HBO Max 7 วัน 4K', categoryId: 'cat-video-streaming', isFeatured: true, sortOrder: 1,
      description: 'HBO Max จอส่วนตัว 4K ระยะเวลา 7 วัน รับประกันตลอดอายุการใช้งาน',
      variants: [
        { label: '7 วัน 4K (÷4)', price: 25, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'hbo-max-30-4k', name: 'HBO Max 30 วัน 4K', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 2,
      description: 'HBO Max จอส่วนตัว 4K ระยะเวลา 30 วัน รับประกันตลอดอายุการใช้งาน',
      variants: [
        { label: '30 วัน 4K (÷4)', price: 80, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'hbo-max-30-hd-2', name: 'HBO Max 30 วัน HD', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 3,
      description: 'HBO Max จอส่วนตัว HD ระยะเวลา 30 วัน แชร์ 2 คน',
      variants: [
        { label: '30 วัน HD (÷2)', price: 80, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'hbo-max-30-hd-4', name: 'HBO Max 30 วัน HD', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 4,
      description: 'HBO Max จอส่วนตัว HD ระยะเวลา 30 วัน แชร์ 4 คน',
      variants: [
        { label: '30 วัน HD (÷4)', price: 40, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // NETFLIX (1 product)
    // ═══════════════════════════════════════════════════
    {
      slug: 'netflix-30day', name: 'Netflix 30 วัน', categoryId: 'cat-video-streaming', isFeatured: true, sortOrder: 5,
      description: 'Netflix จอส่วนตัว ระยะเวลา 30 วัน รับประกันตลอดอายุการใช้งาน',
      variants: [
        { label: '30 วัน แบบจอ', price: 120, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // WE TV (4 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'wetv-30-private', name: 'WeTV 30 วัน ส่วนตัว', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 6,
      description: 'WeTV จอส่วนตัว ไม่แชร์ ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน ส่วนตัว', price: 85, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'wetv-30-2', name: 'WeTV 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 7,
      description: 'WeTV แชร์ 2 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷2)', price: 45, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'wetv-30-3', name: 'WeTV 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 8,
      description: 'WeTV แชร์ 3 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷3)', price: 32, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'wetv-30-4', name: 'WeTV 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 9,
      description: 'WeTV แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷4)', price: 23, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // iQIYI (5 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'iqiyi-30-private', name: 'iQIYI 30 วัน ส่วนตัว', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 10,
      description: 'iQIYI จอส่วนตัว ไม่แชร์ ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน ส่วนตัว', price: 62, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'iqiyi-30-2', name: 'iQIYI 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 11,
      description: 'iQIYI แชร์ 2 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷2)', price: 32, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'iqiyi-30-3', name: 'iQIYI 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 12,
      description: 'iQIYI แชร์ 3 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷3)', price: 22, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'iqiyi-30-4', name: 'iQIYI 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 13,
      description: 'iQIYI แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷4)', price: 16, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'iqiyi-4k-4', name: 'iQIYI 4K', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 14,
      description: 'iQIYI 4K แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน 4K (÷4)', price: 25, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // PRIME VIDEO (6 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'prime-30-3', name: 'Prime Video 30 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 15,
      description: 'Prime Video แชร์ 3 คน ไม่ชน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷3) ไม่ชน', price: 40, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'prime-30-4', name: 'Prime Video 30 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 16,
      description: 'Prime Video แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷4) ชน', price: 30, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'prime-30-5', name: 'Prime Video 30 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 17,
      description: 'Prime Video แชร์ 5 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷5) ชน', price: 25, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'prime-7-3', name: 'Prime Video 7 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 18,
      description: 'Prime Video แชร์ 3 คน ไม่ชน ระยะเวลา 7 วัน',
      variants: [
        { label: '7 วัน (÷3) ไม่ชน', price: 15, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'prime-7-4', name: 'Prime Video 7 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 19,
      description: 'Prime Video แชร์ 4 คน ระยะเวลา 7 วัน',
      variants: [
        { label: '7 วัน (÷4) ชน', price: 10, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'prime-7-5', name: 'Prime Video 7 วัน', categoryId: 'cat-video-streaming', isFeatured: false, sortOrder: 20,
      description: 'Prime Video แชร์ 5 คน ระยะเวลา 7 วัน',
      variants: [
        { label: '7 วัน (÷5) ชน', price: 9, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // YOUKU (4 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'youku-30-private', name: 'Youku 30 วัน ยกแอค', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 21,
      description: 'Youku ยกแอคเคานต์ ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน ยกแอค', price: 60, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'youku-30-2', name: 'Youku 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 22,
      description: 'Youku แชร์ 2 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷2)', price: 30, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'youku-30-3', name: 'Youku 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 23,
      description: 'Youku แชร์ 3 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷3)', price: 20, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'youku-30-4', name: 'Youku 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 24,
      description: 'Youku แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷4)', price: 15, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // ONED (3 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'oned-30-private', name: 'ONED 30 วัน ส่วนตัว', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 25,
      description: 'ONED จอส่วนตัว ไม่แชร์ ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน ส่วนตัว', price: 120, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'oned-30-2', name: 'ONED 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 26,
      description: 'ONED แชร์ 2 คน ไม่ชน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷2) ไม่ชน', price: 65, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'oned-30-3', name: 'ONED 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 27,
      description: 'ONED แชร์ 3 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷3) ชน', price: 45, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // MONOMAX (1 product)
    // ═══════════════════════════════════════════════════
    {
      slug: 'monomax-30', name: 'Monomax 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 28,
      description: 'Monomax จอส่วนตัว แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน จอส่วนตัว (÷4)', price: 45, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // BILIBILI (1 product)
    // ═══════════════════════════════════════════════════
    {
      slug: 'bilibili-30', name: 'Bilibili 30 วัน', categoryId: 'cat-asian-streaming', isFeatured: false, sortOrder: 29,
      description: 'Bilibili แชร์ 4 คน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน (÷4)', price: 20, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // SPOTIFY (2 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'spotify-store', name: 'Spotify Premium ร้าน', categoryId: 'cat-music', isFeatured: true, sortOrder: 30,
      description: 'Spotify Premium เมลร้าน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน เมลร้าน', price: 45, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'spotify-customer', name: 'Spotify Premium ลูกค้า', categoryId: 'cat-music', isFeatured: false, sortOrder: 31,
      description: 'Spotify Premium เมลลูกค้า ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน เมลลค', price: 40, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // YOUTUBE PREMIUM (2 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'youtube-premium-store', name: 'YouTube Premium ร้าน', categoryId: 'cat-music', isFeatured: false, sortOrder: 32,
      description: 'YouTube Premium เมลร้าน ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน เมลร้าน', price: 25, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'youtube-premium-customer', name: 'YouTube Premium ลูกค้า', categoryId: 'cat-music', isFeatured: false, sortOrder: 33,
      description: 'YouTube Premium เมลลูกค้า ระยะเวลา 30 วัน',
      variants: [
        { label: '30 วัน เมลลค', price: 7, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // MICROSOFT 365 (2 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'microsoft-365-store', name: 'Microsoft 365 ร้าน', categoryId: 'cat-tools', isFeatured: false, sortOrder: 34,
      description: 'Microsoft 365 เมลร้าน ใช้งานได้ทั้ง Word, Excel, PowerPoint',
      variants: [
        { label: 'เมลร้าน', price: 25, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'microsoft-365-customer', name: 'Microsoft 365 ลูกค้า', categoryId: 'cat-tools', isFeatured: false, sortOrder: 35,
      description: 'Microsoft 365 เมลลูกค้า ใช้งานได้ทั้ง Word, Excel, PowerPoint',
      variants: [
        { label: 'เมลลค', price: 18, stock: 10, sortOrder: 1 },
      ],
    },

    // ═══════════════════════════════════════════════════
    // CAPCUT (2 products)
    // ═══════════════════════════════════════════════════
    {
      slug: 'capcut-30', name: 'CapCut 30 วัน', categoryId: 'cat-editing', isFeatured: false, sortOrder: 36,
      description: 'CapCut Pro จอส่วนตัว ระยะเวลา 30 วัน ใช้ฟีเจอร์ Pro ได้ทั้งหมด',
      variants: [
        { label: '30 วัน จอส่วนตัว', price: 139, stock: 10, sortOrder: 1 },
      ],
    },
    {
      slug: 'capcut-7', name: 'CapCut 7 วัน', categoryId: 'cat-editing', isFeatured: false, sortOrder: 37,
      description: 'CapCut Pro จอส่วนตัว ระยะเวลา 7 วัน ใช้ฟีเจอร์ Pro ได้ทั้งหมด',
      variants: [
        { label: '7 วัน ส่วนตัว', price: 59, stock: 10, sortOrder: 1 },
      ],
    },
  ];

  let totalVariants = 0;
  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        isFeatured: product.isFeatured,
      },
      create: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        isFeatured: product.isFeatured,
      },
    });

    for (const variant of product.variants) {
      const variantId = `${product.slug}-${variant.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      await prisma.productVariant.upsert({
        where: { id: variantId },
        update: {
          label: variant.label,
          price: variant.price,
          stock: variant.stock,
          sortOrder: variant.sortOrder,
        },
        create: {
          id: variantId,
          productId: created.id,
          label: variant.label,
          price: variant.price,
          stock: variant.stock,
          sortOrder: variant.sortOrder,
        },
      });
      totalVariants++;
    }
    console.log(`  ✅ ${product.name} (${product.variants.length} variants)`);
  }

  console.log(`\n🎉 Seed complete!`);
  console.log(`  📁 ${categories.length} categories`);
  console.log(`  📦 ${products.length} products`);
  console.log(`  🔢 ${totalVariants} variants`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
