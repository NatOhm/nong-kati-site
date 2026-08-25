/**
 * Database Seed Script — 06-database.md §22
 * Seeds categories, products, and variants into Supabase.
 *
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ─── Categories ─────────────────────────────────────
  console.log('📁 Seeding categories...');
  const categories = [
    // Level 1
    { id: 'cat-gaming', parentId: null, slug: 'gaming', name: 'เกม', icon: 'Gamepad2', sortOrder: 1 },
    { id: 'cat-streaming', parentId: null, slug: 'streaming', name: 'สตรีมมิ่ง', icon: 'Tv', sortOrder: 2 },
    { id: 'cat-ecommerce', parentId: null, slug: 'ecommerce', name: 'อีคอมเมิร์ซ', icon: 'ShoppingBag', sortOrder: 3 },
    // Level 2 — Gaming
    { id: 'cat-mobile-games', parentId: 'cat-gaming', slug: 'mobile-games', name: 'เกมมือถือ', icon: 'Smartphone', sortOrder: 1 },
    { id: 'cat-pc-games', parentId: 'cat-gaming', slug: 'pc-games', name: 'PC & Steam', icon: 'Monitor', sortOrder: 2 },
    { id: 'cat-console', parentId: 'cat-gaming', slug: 'console', name: 'Console', icon: 'Gamepad', sortOrder: 3 },
    // Level 2 — Streaming
    { id: 'cat-video', parentId: 'cat-streaming', slug: 'video', name: 'วิดีโอ', icon: 'Play', sortOrder: 1 },
    { id: 'cat-music', parentId: 'cat-streaming', slug: 'music', name: 'เพลง', icon: 'Music', sortOrder: 2 },
    // Level 2 — E-Commerce
    { id: 'cat-shopping', parentId: 'cat-ecommerce', slug: 'shopping', name: 'ช้อปปิ้ง', icon: 'ShoppingCart', sortOrder: 1 },
    { id: 'cat-app-stores', parentId: 'cat-ecommerce', slug: 'app-stores', name: 'App Stores', icon: 'Smartphone', sortOrder: 2 },
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
    {
      slug: 'rov-diamond', name: 'ROV Diamond', categoryId: 'cat-mobile-games', isFeatured: true, sortOrder: 1,
      description: 'ROV Diamond ใช้สำหรับซื้อสกินและไอเทมในเกม Arena of Valor (ROV) เติมเพชรได้ทันทีหลังชำระเงิน',
      variants: [
        { skuCode: 'ROV-DIA-60', label: '60 เพชร', price: 63.50, stock: 50, sortOrder: 1 },
        { skuCode: 'ROV-DIA-120', label: '120 เพชร', price: 127.00, stock: 50, sortOrder: 2 },
        { skuCode: 'ROV-DIA-300', label: '300 เพชร', price: 318.00, stock: 50, sortOrder: 3 },
        { skuCode: 'ROV-DIA-600', label: '600 เพชร', price: 635.00, stock: 5, sortOrder: 4 },
      ],
    },
    {
      slug: 'pubg-mobile-uc', name: 'PUBG Mobile UC', categoryId: 'cat-mobile-games', isFeatured: true, sortOrder: 2,
      description: 'Unknown Cash (UC) สำหรับเกม PUBG Mobile ใช้ซื้อ Royale Pass และสกินในเกม',
      variants: [
        { skuCode: 'PUBG-UC-60', label: '60 UC', price: 64.00, stock: 50, sortOrder: 1 },
        { skuCode: 'PUBG-UC-325', label: '325 UC', price: 345.00, stock: 50, sortOrder: 2 },
        { skuCode: 'PUBG-UC-660', label: '660 UC', price: 698.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'genshin-impact-genesis', name: 'Genshin Impact Genesis Crystal', categoryId: 'cat-mobile-games', isFeatured: false, sortOrder: 3,
      description: 'Genesis Crystal สำหรับเกม Genshin Impact ใช้ซื้อไอเทม Premium ในเกม',
      variants: [
        { skuCode: 'GENSHIN-60', label: '60 Crystal', price: 63.50, stock: 50, sortOrder: 1 },
        { skuCode: 'GENSHIN-300', label: '300 Crystal', price: 318.00, stock: 50, sortOrder: 2 },
        { skuCode: 'GENSHIN-980', label: '980 Crystal', price: 1035.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'free-fire-diamond', name: 'Free Fire Diamond', categoryId: 'cat-mobile-games', isFeatured: false, sortOrder: 4,
      description: 'Diamond สำหรับเกม Garena Free Fire เติมเพชรได้ทันที',
      variants: [
        { skuCode: 'FF-DM-50', label: '50 เพชร', price: 53.50, stock: 50, sortOrder: 1 },
        { skuCode: 'FF-DM-110', label: '110 เพชร', price: 117.00, stock: 50, sortOrder: 2 },
        { skuCode: 'FF-DM-290', label: '290 เพชร', price: 308.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'steam-wallet', name: 'Steam Wallet', categoryId: 'cat-pc-games', isFeatured: true, sortOrder: 5,
      description: 'Steam Wallet เติมเงินเข้า Steam Account ใช้ซื้อเกม DLC และไอเทมบน Steam Store',
      variants: [
        { skuCode: 'STEAM-100', label: '฿100', price: 107.00, stock: 50, sortOrder: 1 },
        { skuCode: 'STEAM-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 2 },
        { skuCode: 'STEAM-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 3 },
        { skuCode: 'STEAM-1000', label: '฿1,000', price: 1058.00, stock: 50, sortOrder: 4 },
      ],
    },
    {
      slug: 'valorant-point', name: 'Valorant Point', categoryId: 'cat-pc-games', isFeatured: false, sortOrder: 6,
      description: 'Valorant Point (VP) สำหรับซื้อสกินและไอเทมในเกม Valorant',
      variants: [
        { skuCode: 'VAL-VP-100', label: '100 VP', price: 107.00, stock: 50, sortOrder: 1 },
        { skuCode: 'VAL-VP-500', label: '500 VP', price: 535.00, stock: 50, sortOrder: 2 },
        { skuCode: 'VAL-VP-1100', label: '1,100 VP', price: 1170.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'cs2-prime', name: 'CS2 Prime Status', categoryId: 'cat-pc-games', isFeatured: false, sortOrder: 7,
      description: 'อัปเกรด CS2 เป็น Prime Status — ปลดล็อคระบบ Prime Matchmaking',
      variants: [
        { skuCode: 'CS2-PRIME', label: 'Prime Upgrade', price: 580.00, stock: 30, sortOrder: 1 },
      ],
    },
    {
      slug: 'psn-wallet', name: 'PlayStation Network Wallet', categoryId: 'cat-console', isFeatured: false, sortOrder: 8,
      description: 'เติมเงินเข้า PlayStation Network ใช้ซื้อเกมและ DLC บน PS Store',
      variants: [
        { skuCode: 'PSN-200', label: '฿200', price: 214.00, stock: 50, sortOrder: 1 },
        { skuCode: 'PSN-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 2 },
        { skuCode: 'PSN-1000', label: '฿1,000', price: 1058.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'xbox-gift-card', name: 'Xbox Gift Card', categoryId: 'cat-console', isFeatured: false, sortOrder: 9,
      description: 'Xbox Gift Card ใช้เติมเงิน Xbox Account ซื้อเกมและ DLC บน Microsoft Store',
      variants: [
        { skuCode: 'XBOX-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 1 },
        { skuCode: 'XBOX-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 2 },
      ],
    },
    {
      slug: 'netflix-gift-card', name: 'Netflix Gift Card', categoryId: 'cat-video', isFeatured: true, sortOrder: 10,
      description: 'บัตรของขวัญ Netflix เติมเงินเข้าบัญชี Netflix ใช้สมัครแพ็กเกจรายเดือน',
      variants: [
        { skuCode: 'NFLX-200', label: '฿200', price: 214.00, stock: 50, sortOrder: 1 },
        { skuCode: 'NFLX-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 2 },
        { skuCode: 'NFLX-600', label: '฿600', price: 636.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'disney-plus-gift-card', name: 'Disney+ Gift Card', categoryId: 'cat-video', isFeatured: false, sortOrder: 11,
      description: 'บัตรของขวัญ Disney+ เติมเงินเข้าบัญชี Disney+ Hotstar',
      variants: [
        { skuCode: 'DISN-150', label: '฿150', price: 160.00, stock: 50, sortOrder: 1 },
        { skuCode: 'DISN-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 2 },
      ],
    },
    {
      slug: 'spotify-premium', name: 'Spotify Premium', categoryId: 'cat-music', isFeatured: false, sortOrder: 12,
      description: 'บัตรของขวัญ Spotify Premium เติมเงินสมัครสมาชิก Premium',
      variants: [
        { skuCode: 'SPOT-150', label: '฿150', price: 160.00, stock: 50, sortOrder: 1 },
        { skuCode: 'SPOT-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 2 },
      ],
    },
    {
      slug: 'apple-music-gift-card', name: 'Apple Music Gift Card', categoryId: 'cat-music', isFeatured: false, sortOrder: 13,
      description: 'บัตรของขวัญ Apple Music ใช้สมัครสมาชิก Apple Music',
      variants: [
        { skuCode: 'APPLE-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 1 },
        { skuCode: 'APPLE-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 2 },
      ],
    },
    {
      slug: 'shopee-gift-card', name: 'Shopee Gift Card', categoryId: 'cat-shopping', isFeatured: false, sortOrder: 14,
      description: 'บัตรของขวัญ Shopee เติมเงินเข้า ShopeePay',
      variants: [
        { skuCode: 'SHOPEE-100', label: '฿100', price: 105.00, stock: 50, sortOrder: 1 },
        { skuCode: 'SHOPEE-300', label: '฿300', price: 315.00, stock: 50, sortOrder: 2 },
        { skuCode: 'SHOPEE-500', label: '฿500', price: 525.00, stock: 50, sortOrder: 3 },
      ],
    },
    {
      slug: 'lazada-gift-card', name: 'Lazada Gift Card', categoryId: 'cat-shopping', isFeatured: false, sortOrder: 15,
      description: 'บัตรของขวัญ Lazada เติมเงินเข้า Lazada Wallet',
      variants: [
        { skuCode: 'LAZ-100', label: '฿100', price: 105.00, stock: 50, sortOrder: 1 },
        { skuCode: 'LAZ-300', label: '฿300', price: 315.00, stock: 50, sortOrder: 2 },
      ],
    },
    {
      slug: 'google-play-gift-card', name: 'Google Play Gift Card', categoryId: 'cat-app-stores', isFeatured: true, sortOrder: 16,
      description: 'บัตรของขวัญ Google Play ใช้ซื้อแอป เกม เพลง และภาพยนตร์บน Google Play Store',
      variants: [
        { skuCode: 'GPLAY-100', label: '฿100', price: 107.00, stock: 50, sortOrder: 1 },
        { skuCode: 'GPLAY-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 2 },
        { skuCode: 'GPLAY-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 3 },
        { skuCode: 'GPLAY-1000', label: '฿1,000', price: 1058.00, stock: 50, sortOrder: 4 },
      ],
    },
    {
      slug: 'apple-app-store-gift-card', name: 'Apple App Store Gift Card', categoryId: 'cat-app-stores', isFeatured: false, sortOrder: 17,
      description: 'บัตรของขวัญ Apple App Store ใช้ซื้อแอป เกม เพลง และภาพยนตร์บน App Store',
      variants: [
        { skuCode: 'APPSTORE-300', label: '฿300', price: 318.00, stock: 50, sortOrder: 1 },
        { skuCode: 'APPSTORE-500', label: '฿500', price: 530.00, stock: 50, sortOrder: 2 },
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
      await prisma.productVariant.upsert({
        where: { id: `${product.slug}-${variant.skuCode.toLowerCase()}` },
        update: {
          label: variant.label,
          price: variant.price,
          stock: variant.stock,
          sortOrder: variant.sortOrder,
        },
        create: {
          id: `${product.slug}-${variant.skuCode.toLowerCase()}`,
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
