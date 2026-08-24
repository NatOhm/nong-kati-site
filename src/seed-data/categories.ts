/**
 * Seed category data — 06-database.md §22.
 * 3 Level-1 categories + 7 Level-2 subcategories per 03-information-architecture.md §8.
 *
 * In production, loaded from DB via Prisma. For M2, hardcoded fixture data.
 */

export interface SeedCategory {
  id: string;
  parentId: string | null;
  slug: string;
  nameTh: string;
  nameEn: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  heroImageUrl: string | null;
  productCount: number;
}

export const seedCategories: SeedCategory[] = [
  // ─── Level 1: Gaming ────────────────────────────
  {
    id: 'cat-gaming',
    parentId: null,
    slug: 'gaming',
    nameTh: 'เกม',
    nameEn: 'Gaming',
    iconName: 'Gamepad2',
    sortOrder: 1,
    isActive: true,
    seoTitle: 'บัตรเกม Gift Card — Nong-Kati',
    seoDescription: 'ซื้อบัตรเกม ROV, Steam, PUBG, PSN และอีกมากมาย ส่งโค้ดทันที จ่ายผ่าน PromptPay หรือบัตรเครดิต',
    heroImageUrl: null,
    productCount: 9,
  },
  {
    id: 'cat-mobile-games',
    parentId: 'cat-gaming',
    slug: 'mobile-games',
    nameTh: 'เกมมือถือ',
    nameEn: 'Mobile Games',
    iconName: 'Smartphone',
    sortOrder: 1,
    isActive: true,
    seoTitle: 'บัตรเกมมือถือ — Nong-Kati',
    seoDescription: 'ซื้อบัตรเติมเงิน ROV, PUBG Mobile, Genshin Impact, Free Fire ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 4,
  },
  {
    id: 'cat-pc-games',
    parentId: 'cat-gaming',
    slug: 'pc-games',
    nameTh: 'PC & Steam',
    nameEn: 'PC & Steam',
    iconName: 'Monitor',
    sortOrder: 2,
    isActive: true,
    seoTitle: 'บัตร Steam Wallet — Nong-Kati',
    seoDescription: 'ซื้อ Steam Wallet, Valorant, CS2 ส่งโค้ดทันที ราคาดี',
    heroImageUrl: null,
    productCount: 3,
  },
  {
    id: 'cat-console',
    parentId: 'cat-gaming',
    slug: 'console',
    nameTh: 'Console',
    nameEn: 'Console',
    iconName: 'Gamepad',
    sortOrder: 3,
    isActive: true,
    seoTitle: 'บัตร PSN, Xbox, Nintendo — Nong-Kati',
    seoDescription: 'ซื้อบัตร PlayStation Network, Xbox, Nintendo eShop ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 2,
  },

  // ─── Level 1: Streaming ─────────────────────────
  {
    id: 'cat-streaming',
    parentId: null,
    slug: 'streaming',
    nameTh: 'สตรีมมิ่ง',
    nameEn: 'Streaming',
    iconName: 'Tv',
    sortOrder: 2,
    isActive: true,
    seoTitle: 'บัตร Netflix Spotify Disney+ — Nong-Kati',
    seoDescription: 'ซื้อบัตร Gift Card สตรีมมิ่ง Netflix, Spotify, Disney+ ราคาถูก ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 4,
  },
  {
    id: 'cat-video',
    parentId: 'cat-streaming',
    slug: 'video',
    nameTh: 'วิดีโอ',
    nameEn: 'Video',
    iconName: 'Play',
    sortOrder: 1,
    isActive: true,
    seoTitle: 'บัตร Netflix Disney+ YouTube — Nong-Kati',
    seoDescription: 'ซื้อบัตร Netflix, Disney+, YouTube Premium ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 2,
  },
  {
    id: 'cat-music',
    parentId: 'cat-streaming',
    slug: 'music',
    nameTh: 'เพลง',
    nameEn: 'Music',
    iconName: 'Music',
    sortOrder: 2,
    isActive: true,
    seoTitle: 'บัตร Spotify Apple Music — Nong-Kati',
    seoDescription: 'ซื้อบัตร Spotify, Apple Music ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 2,
  },

  // ─── Level 1: E-Commerce ────────────────────────
  {
    id: 'cat-ecommerce',
    parentId: null,
    slug: 'ecommerce',
    nameTh: 'อีคอมเมิร์ซ',
    nameEn: 'E-Commerce',
    iconName: 'ShoppingBag',
    sortOrder: 3,
    isActive: true,
    seoTitle: 'บัตร Shopee Lazada Google Play — Nong-Kati',
    seoDescription: 'ซื้อบัตรเติมเงิน Shopee, Lazada, Google Play ราคาดี ส่งโค้ดทันที ทุกวัน',
    heroImageUrl: null,
    productCount: 4,
  },
  {
    id: 'cat-shopping',
    parentId: 'cat-ecommerce',
    slug: 'shopping',
    nameTh: 'ช้อปปิ้ง',
    nameEn: 'Shopping',
    iconName: 'ShoppingCart',
    sortOrder: 1,
    isActive: true,
    seoTitle: 'บัตร Shopee Lazada — Nong-Kati',
    seoDescription: 'ซื้อบัตร Shopee, Lazada ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 2,
  },
  {
    id: 'cat-app-stores',
    parentId: 'cat-ecommerce',
    slug: 'app-stores',
    nameTh: 'App Stores',
    nameEn: 'App Stores',
    iconName: 'Smartphone',
    sortOrder: 2,
    isActive: true,
    seoTitle: 'บัตร Google Play Apple App Store — Nong-Kati',
    seoDescription: 'ซื้อบัตร Google Play, Apple App Store ส่งโค้ดทันที',
    heroImageUrl: null,
    productCount: 2,
  },
];
