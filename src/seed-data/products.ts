/**
 * Seed product data — 06-database.md §22.
 * 15 products across 3 categories with denomination variants.
 * Each product has Thai + English names, descriptions, and variant pricing.
 */

export interface SeedVariant {
  id: string;
  skuCode: string;
  faceValueThb: string;
  salePriceThb: string;
  vatAmountThb: string;
  salePriceExVatThb: string;
  status: 'active' | 'discontinued';
  inStock: boolean;
  isLowStock: boolean;
  sortOrder: number;
}

export interface SeedProduct {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string | null;
  thumbnailUrl: string | null;
  categoryId: string;
  categorySlug: string;
  categoryNameTh: string;
  categoryNameEn: string;
  parentCategorySlug: string | null;
  parentCategoryNameTh: string | null;
  isFeatured: boolean;
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
  seoTitle: string | null;
  seoDescription: string | null;
  redemptionInstructions: string | null;
  refundPolicyNote: string | null;
  averageRating: string | null;
  reviewCount: number;
  variants: SeedVariant[];
}

function v(
  id: string,
  sku: string,
  faceValue: number,
  salePrice: number,
  inStock: boolean,
  isLowStock = false,
): SeedVariant {
  const vatAmount = Math.round((salePrice / 1.07) * 0.07 * 100) / 100;
  const exVat = Math.round((salePrice - vatAmount) * 100) / 100;
  return {
    id,
    skuCode: sku,
    faceValueThb: faceValue.toFixed(2),
    salePriceThb: salePrice.toFixed(2),
    vatAmountThb: vatAmount.toFixed(2),
    salePriceExVatThb: exVat.toFixed(2),
    status: 'active',
    inStock,
    isLowStock,
    sortOrder: 0,
  };
}

export const seedProducts: SeedProduct[] = [
  // ═══════════════════════════════════════════════
  // GAMING — Mobile Games
  // ═══════════════════════════════════════════════
  {
    id: 'prod-rov',
    slug: 'rov-diamond',
    nameTh: 'ROV Diamond',
    nameEn: 'ROV Diamond',
    descriptionTh: '<p>ROV Diamond ใช้สำหรับซื้อสกินและไอเทมในเกม Arena of Valor (ROV) เติมเพชรได้ทันทีหลังชำระเงิน</p><p>วิธีใช้: เปิดเกม ROV → ไปที่ร้านค้า → เลือกเติมเพชร → ใส่โค้ดที่ได้รับ</p>',
    thumbnailUrl: null,
    categoryId: 'cat-mobile-games',
    categorySlug: 'mobile-games',
    categoryNameTh: 'เกมมือถือ',
    categoryNameEn: 'Mobile Games',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: true,
    sortOrder: 1,
    status: 'published',
    seoTitle: 'ROV Diamond — ซื้อได้ที่ Nong-Kati',
    seoDescription: 'ซื้อ ROV Diamond เติมเพชร ROV ส่งโค้ดทันที ราคาถูก จ่ายผ่าน PromptPay',
    redemptionInstructions: '<ol><li>เปิดเกม ROV</li><li>ไปที่ร้านค้า → เติมเพชร</li><li>เลือก "เติมด้วยโค้ด"</li><li>ใส่โค้ดที่ได้รับ</li><li>เพชรจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.8',
    reviewCount: 156,
    variants: [
      v('var-rov-60', 'ROV-DIA-60', 60, 63.50, true),
      v('var-rov-120', 'ROV-DIA-120', 120, 127.00, true),
      v('var-rov-300', 'ROV-DIA-300', 300, 318.00, true),
      v('var-rov-600', 'ROV-DIA-600', 600, 635.00, true, true),
    ],
  },
  {
    id: 'prod-pubg',
    slug: 'pubg-mobile-uc',
    nameTh: 'PUBG Mobile UC',
    nameEn: 'PUBG Mobile UC',
    descriptionTh: '<p>Unknown Cash (UC) สำหรับเกม PUBG Mobile ใช้ซื้อ Royale Pass และสกินในเกม</p>',
    thumbnailUrl: null,
    categoryId: 'cat-mobile-games',
    categorySlug: 'mobile-games',
    categoryNameTh: 'เกมมือถือ',
    categoryNameEn: 'Mobile Games',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: true,
    sortOrder: 2,
    status: 'published',
    seoTitle: 'PUBG Mobile UC — ซื้อได้ที่ Nong-Kati',
    seoDescription: 'ซื้อ PUBG Mobile UC เติมเงิน PUBG ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิดเกม PUBG Mobile</li><li>ไปที่ร้านค้า → เติม UC</li><li>เลือก "Redeem Code"</li><li>ใส่โค้ดที่ได้รับ</li><li>UC จะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.7',
    reviewCount: 98,
    variants: [
      v('var-pubg-60', 'PUBG-UC-60', 60, 64.00, true),
      v('var-pubg-325', 'PUBG-UC-325', 325, 345.00, true),
      v('var-pubg-660', 'PUBG-UC-660', 660, 698.00, true),
    ],
  },
  {
    id: 'prod-genshin',
    slug: 'genshin-impact-genesis',
    nameTh: 'Genshin Impact Genesis Crystal',
    nameEn: 'Genshin Impact Genesis Crystal',
    descriptionTh: '<p>Genesis Crystal สำหรับเกม Genshin Impact ใช้ซื้อไอเทม Premium ในเกม</p>',
    thumbnailUrl: null,
    categoryId: 'cat-mobile-games',
    categorySlug: 'mobile-games',
    categoryNameTh: 'เกมมือถือ',
    categoryNameEn: 'Mobile Games',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 3,
    status: 'published',
    seoTitle: 'Genshin Impact Genesis Crystal — Nong-Kati',
    seoDescription: 'ซื้อ Genshin Impact Genesis Crystal ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้าเกม Genshin Impact</li><li>เปิดเมนู → Redeem Code</li><li>ใส่โค้ดที่ได้รับ</li><li>Crystal จะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.9',
    reviewCount: 203,
    variants: [
      v('var-genshin-60', 'GENSHIN-60', 60, 63.50, true),
      v('var-genshin-300', 'GENSHIN-300', 300, 318.00, true),
      v('var-genshin-980', 'GENSHIN-980', 980, 1035.00, true),
    ],
  },
  {
    id: 'prod-freefire',
    slug: 'free-fire-diamond',
    nameTh: 'Free Fire Diamond',
    nameEn: 'Free Fire Diamond',
    descriptionTh: '<p>Diamond สำหรับเกม Garena Free Fire เติมเพชรได้ทันที</p>',
    thumbnailUrl: null,
    categoryId: 'cat-mobile-games',
    categorySlug: 'mobile-games',
    categoryNameTh: 'เกมมือถือ',
    categoryNameEn: 'Mobile Games',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 4,
    status: 'published',
    seoTitle: 'Free Fire Diamond — Nong-Kati',
    seoDescription: 'ซื้อ Free Fire Diamond เติมเพชร Free Fire ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้าเกม Free Fire</li><li>ไปที่ร้านค้า → เติมเพชร</li><li>ใส่โค้ดที่ได้รับ</li><li>เพชรจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.6',
    reviewCount: 67,
    variants: [
      v('var-ff-50', 'FF-DM-50', 50, 53.50, true),
      v('var-ff-110', 'FF-DM-110', 110, 117.00, true),
      v('var-ff-290', 'FF-DM-290', 290, 308.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // GAMING — PC & Steam
  // ═══════════════════════════════════════════════
  {
    id: 'prod-steam',
    slug: 'steam-wallet',
    nameTh: 'Steam Wallet',
    nameEn: 'Steam Wallet',
    descriptionTh: '<p>Steam Wallet เติมเงินเข้า Steam Account ใช้ซื้อเกม DLC และไอเทมบน Steam Store</p>',
    thumbnailUrl: null,
    categoryId: 'cat-pc-games',
    categorySlug: 'pc-games',
    categoryNameTh: 'PC & Steam',
    categoryNameEn: 'PC & Steam',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: true,
    sortOrder: 5,
    status: 'published',
    seoTitle: 'Steam Wallet — ซื้อได้ที่ Nong-Kati',
    seoDescription: 'ซื้อ Steam Wallet เติมเงิน Steam ส่งโค้ดทันที ราคาถูก จ่ายผ่าน PromptPay',
    redemptionInstructions: '<ol><li>เปิด Steam Client หรือเว็บ store.steampowered.com</li><li>ล็อกอินเข้าบัญชี Steam</li><li>ไปที่ Game → Activate a Product on Steam</li><li>ใส่โค้ดที่ได้รับ</li><li>ยอดเงินจะเข้า Wallet ทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.9',
    reviewCount: 312,
    variants: [
      v('var-steam-100', 'STEAM-100', 100, 107.00, true),
      v('var-steam-300', 'STEAM-300', 300, 318.00, true),
      v('var-steam-500', 'STEAM-500', 500, 530.00, true),
      v('var-steam-1000', 'STEAM-1000', 1000, 1058.00, true),
    ],
  },
  {
    id: 'prod-valorant',
    slug: 'valorant-point',
    nameTh: 'Valorant Point',
    nameEn: 'Valorant Point',
    descriptionTh: '<p>Valorant Point (VP) สำหรับซื้อสกินและไอเทมในเกม Valorant</p>',
    thumbnailUrl: null,
    categoryId: 'cat-pc-games',
    categorySlug: 'pc-games',
    categoryNameTh: 'PC & Steam',
    categoryNameEn: 'PC & Steam',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 6,
    status: 'published',
    seoTitle: 'Valorant Point — Nong-Kati',
    seoDescription: 'ซื้อ Valorant Point เติมเงิน Valorant ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้าเว็บ riot.com</li><li>ล็อกอินบัญชี Riot</li><li>ไปที่ Riot Wallet → Prepaid Cards</li><li>ใส่โค้ดที่ได้รับ</li><li>VP จะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.7',
    reviewCount: 89,
    variants: [
      v('var-valorant-100', 'VAL-VP-100', 100, 107.00, true),
      v('var-valorant-500', 'VAL-VP-500', 500, 535.00, true),
      v('var-valorant-1100', 'VAL-VP-1100', 1100, 1170.00, true),
    ],
  },
  {
    id: 'prod-cs2',
    slug: 'cs2-prime',
    nameTh: 'CS2 Prime Status',
    nameEn: 'CS2 Prime Status Upgrade',
    descriptionTh: '<p>อัปเกรด CS2 เป็น Prime Status — ปลดล็อคระบบ Prime Matchmaking และรับไอเทมพิเศษ</p>',
    thumbnailUrl: null,
    categoryId: 'cat-pc-games',
    categorySlug: 'pc-games',
    categoryNameTh: 'PC & Steam',
    categoryNameEn: 'PC & Steam',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 7,
    status: 'published',
    seoTitle: 'CS2 Prime Status — Nong-Kati',
    seoDescription: 'ซื้อ CS2 Prime Status Upgrade ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิด Steam</li><li>ไปที่ Game → Activate a Product on Steam</li><li>ใส่โค้ดที่ได้รับ</li><li>Prime Status จะอัปเกรดทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.5',
    reviewCount: 45,
    variants: [
      v('var-cs2-prime', 'CS2-PRIME', 549, 580.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // GAMING — Console
  // ═══════════════════════════════════════════════
  {
    id: 'prod-psn',
    slug: 'psn-wallet',
    nameTh: 'PlayStation Network Wallet',
    nameEn: 'PlayStation Network Wallet',
    descriptionTh: '<p>เติมเงินเข้า PlayStation Network ใช้ซื้อเกมและ DLC บน PS Store</p>',
    thumbnailUrl: null,
    categoryId: 'cat-console',
    categorySlug: 'console',
    categoryNameTh: 'Console',
    categoryNameEn: 'Console',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 8,
    status: 'published',
    seoTitle: 'PSN Wallet — Nong-Kati',
    seoDescription: 'ซื้อ PlayStation Network Wallet ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิด PS5/PS4 → Settings → Account Management</li><li>เลือก Redeem Codes</li><li>ใส่โค้ดที่ได้รับ</li><li>ยอดเงินจะเข้า Wallet ทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.8',
    reviewCount: 134,
    variants: [
      v('var-psn-200', 'PSN-200', 200, 214.00, true),
      v('var-psn-500', 'PSN-500', 500, 530.00, true),
      v('var-psn-1000', 'PSN-1000', 1000, 1058.00, true),
    ],
  },
  {
    id: 'prod-xbox',
    slug: 'xbox-gift-card',
    nameTh: 'Xbox Gift Card',
    nameEn: 'Xbox Gift Card',
    descriptionTh: '<p>Xbox Gift Card ใช้เติมเงิน Xbox Account ซื้อเกมและ DLC บน Microsoft Store</p>',
    thumbnailUrl: null,
    categoryId: 'cat-console',
    categorySlug: 'console',
    categoryNameTh: 'Console',
    categoryNameEn: 'Console',
    parentCategorySlug: 'gaming',
    parentCategoryNameTh: 'เกม',
    isFeatured: false,
    sortOrder: 9,
    status: 'published',
    seoTitle: 'Xbox Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Xbox Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้า xbox.com 或เปิด Xbox Console</li><li>ล็อกอินบัญชี Microsoft</li><li>ไปที่ Redeem Code</li><li>ใส่โค้ดที่ได้รับ</li><li>ยอดเงินจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.6',
    reviewCount: 72,
    variants: [
      v('var-xbox-300', 'XBOX-300', 300, 318.00, true),
      v('var-xbox-500', 'XBOX-500', 500, 530.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // STREAMING — Video
  // ═══════════════════════════════════════════════
  {
    id: 'prod-netflix',
    slug: 'netflix-gift-card',
    nameTh: 'Netflix Gift Card',
    nameEn: 'Netflix Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Netflix เติมเงินเข้าบัญชี Netflix ใช้สมัครแพ็กเกจรายเดือน</p>',
    thumbnailUrl: null,
    categoryId: 'cat-video',
    categorySlug: 'video',
    categoryNameTh: 'วิดีโอ',
    categoryNameEn: 'Video',
    parentCategorySlug: 'streaming',
    parentCategoryNameTh: 'สตรีมมิ่ง',
    isFeatured: true,
    sortOrder: 10,
    status: 'published',
    seoTitle: 'Netflix Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Netflix Gift Card บัตรของขวัญ Netflix ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้า netflix.com/redeem</li><li>ล็อกอินบัญชี Netflix</li><li>ใส่โค้ดที่ได้รับ</li><li>ยอดเงินจะเข้าบัญชีทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.8',
    reviewCount: 245,
    variants: [
      v('var-netflix-200', 'NFLX-200', 200, 214.00, true),
      v('var-netflix-300', 'NFLX-300', 300, 318.00, true),
      v('var-netflix-600', 'NFLX-600', 600, 636.00, true),
    ],
  },
  {
    id: 'prod-disney',
    slug: 'disney-plus-gift-card',
    nameTh: 'Disney+ Gift Card',
    nameEn: 'Disney+ Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Disney+ เติมเงินเข้าบัญชี Disney+ Hotstar</p>',
    thumbnailUrl: null,
    categoryId: 'cat-video',
    categorySlug: 'video',
    categoryNameTh: 'วิดีโอ',
    categoryNameEn: 'Video',
    parentCategorySlug: 'streaming',
    parentCategoryNameTh: 'สตรีมมิ่ง',
    isFeatured: false,
    sortOrder: 11,
    status: 'published',
    seoTitle: 'Disney+ Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Disney+ Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้า hotstar.com</li><li>ล็อกอินบัญชี Disney+</li><li>ไปที่ Redeem Code</li><li>ใส่โค้ดที่ได้รับ</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.5',
    reviewCount: 56,
    variants: [
      v('var-disney-150', 'DISN-150', 150, 160.00, true),
      v('var-disney-300', 'DISN-300', 300, 318.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // STREAMING — Music
  // ═══════════════════════════════════════════════
  {
    id: 'prod-spotify',
    slug: 'spotify-premium',
    nameTh: 'Spotify Premium',
    nameEn: 'Spotify Premium Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Spotify Premium เติมเงินสมัครสมาชิก Premium ฟังเพลงไม่มีโฆษณา</p>',
    thumbnailUrl: null,
    categoryId: 'cat-music',
    categorySlug: 'music',
    categoryNameTh: 'เพลง',
    categoryNameEn: 'Music',
    parentCategorySlug: 'streaming',
    parentCategoryNameTh: 'สตรีมมิ่ง',
    isFeatured: false,
    sortOrder: 12,
    status: 'published',
    seoTitle: 'Spotify Premium — Nong-Kati',
    seoDescription: 'ซื้อ Spotify Premium Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เข้า spotify.com/redeem</li><li>ล็อกอินบัญชี Spotify</li><li>ใส่โค้ดที่ได้รับ</li><li>Premium จะเปิดใช้งานทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.7',
    reviewCount: 178,
    variants: [
      v('var-spotify-150', 'SPOT-150', 150, 160.00, true),
      v('var-spotify-300', 'SPOT-300', 300, 318.00, true),
    ],
  },
  {
    id: 'prod-apple-music',
    slug: 'apple-music-gift-card',
    nameTh: 'Apple Music Gift Card',
    nameEn: 'Apple Music Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Apple Music ใช้สมัครสมาชิก Apple Music หรือซื้อเพลง/ภาพยนตร์บน iTunes</p>',
    thumbnailUrl: null,
    categoryId: 'cat-music',
    categorySlug: 'music',
    categoryNameTh: 'เพลง',
    categoryNameEn: 'Music',
    parentCategorySlug: 'streaming',
    parentCategoryNameTh: 'สตรีมมิ่ง',
    isFeatured: false,
    sortOrder: 13,
    status: 'published',
    seoTitle: 'Apple Music Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Apple Music Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิด App Store หรือ iTunes</li><li>แตะรูปโปรไฟล์ → Redeem Gift Card</li><li>ใส่โค้ดที่ได้รับ</li><li>เครดิตจะเข้า Apple ID ทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.6',
    reviewCount: 64,
    variants: [
      v('var-apple-300', 'APPLE-300', 300, 318.00, true),
      v('var-apple-500', 'APPLE-500', 500, 530.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // E-COMMERCE — Shopping
  // ═══════════════════════════════════════════════
  {
    id: 'prod-shopee',
    slug: 'shopee-gift-card',
    nameTh: 'Shopee Gift Card',
    nameEn: 'Shopee Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Shopee เติมเงินเข้า ShopeePay ใช้ช้อปปิ้งบน Shopee</p>',
    thumbnailUrl: null,
    categoryId: 'cat-shopping',
    categorySlug: 'shopping',
    categoryNameTh: 'ช้อปปิ้ง',
    categoryNameEn: 'Shopping',
    parentCategorySlug: 'ecommerce',
    parentCategoryNameTh: 'อีคอมเมิร์ซ',
    isFeatured: false,
    sortOrder: 14,
    status: 'published',
    seoTitle: 'Shopee Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Shopee Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิดแอป Shopee</li><li>ไปที่ ShopeePay → เติมเงิน</li><li>เลือก "เติมด้วยโค้ด"</li><li>ใส่โค้ดที่ได้รับ</li><li>เครดิตจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.4',
    reviewCount: 87,
    variants: [
      v('var-shopee-100', 'SHOPEE-100', 100, 105.00, true),
      v('var-shopee-300', 'SHOPEE-300', 300, 315.00, true),
      v('var-shopee-500', 'SHOPEE-500', 500, 525.00, true),
    ],
  },
  {
    id: 'prod-lazada',
    slug: 'lazada-gift-card',
    nameTh: 'Lazada Gift Card',
    nameEn: 'Lazada Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Lazada เติมเงินเข้า Lazada Wallet ใช้ช้อปปิ้งบน Lazada</p>',
    thumbnailUrl: null,
    categoryId: 'cat-shopping',
    categorySlug: 'shopping',
    categoryNameTh: 'ช้อปปิ้ง',
    categoryNameEn: 'Shopping',
    parentCategorySlug: 'ecommerce',
    parentCategoryNameTh: 'อีคอมเมิร์ซ',
    isFeatured: false,
    sortOrder: 15,
    status: 'published',
    seoTitle: 'Lazada Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Lazada Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิดแอป Lazada</li><li>ไปที่ Lazada Wallet → เติมเงิน</li><li>ใส่โค้ดที่ได้รับ</li><li>เครดิตจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.3',
    reviewCount: 52,
    variants: [
      v('var-lazada-100', 'LAZ-100', 100, 105.00, true),
      v('var-lazada-300', 'LAZ-300', 300, 315.00, true),
    ],
  },

  // ═══════════════════════════════════════════════
  // E-COMMERCE — App Stores
  // ═══════════════════════════════════════════════
  {
    id: 'prod-google-play',
    slug: 'google-play-gift-card',
    nameTh: 'Google Play Gift Card',
    nameEn: 'Google Play Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Google Play ใช้ซื้อแอป เกม เพลง และภาพยนตร์บน Google Play Store</p>',
    thumbnailUrl: null,
    categoryId: 'cat-app-stores',
    categorySlug: 'app-stores',
    categoryNameTh: 'App Stores',
    categoryNameEn: 'App Stores',
    parentCategorySlug: 'ecommerce',
    parentCategoryNameTh: 'อีคอมเมิร์ซ',
    isFeatured: true,
    sortOrder: 16,
    status: 'published',
    seoTitle: 'Google Play Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Google Play Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิด Google Play Store</li><li>แตะเมนู → แลกโค้ด</li><li>ใส่โค้ดที่ได้รับ</li><li>เครดิตจะเข้าทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.8',
    reviewCount: 198,
    variants: [
      v('var-gplay-100', 'GPLAY-100', 100, 107.00, true),
      v('var-gplay-300', 'GPLAY-300', 300, 318.00, true),
      v('var-gplay-500', 'GPLAY-500', 500, 530.00, true),
      v('var-gplay-1000', 'GPLAY-1000', 1000, 1058.00, true),
    ],
  },
  {
    id: 'prod-apple-appstore',
    slug: 'apple-app-store-gift-card',
    nameTh: 'Apple App Store Gift Card',
    nameEn: 'Apple App Store Gift Card',
    descriptionTh: '<p>บัตรของขวัญ Apple App Store ใช้ซื้อแอป เกม เพลง และภาพยนตร์บน App Store</p>',
    thumbnailUrl: null,
    categoryId: 'cat-app-stores',
    categorySlug: 'app-stores',
    categoryNameTh: 'App Stores',
    categoryNameEn: 'App Stores',
    parentCategorySlug: 'ecommerce',
    parentCategoryNameTh: 'อีคอมเมิร์ซ',
    isFeatured: false,
    sortOrder: 17,
    status: 'published',
    seoTitle: 'Apple App Store Gift Card — Nong-Kati',
    seoDescription: 'ซื้อ Apple App Store Gift Card ส่งโค้ดทันที',
    redemptionInstructions: '<ol><li>เปิด App Store</li><li>แตะรูปโปรไฟล์ → Redeem Gift Card</li><li>ใส่โค้ดที่ได้รับ</li><li>เครดิตจะเข้า Apple ID ทันที</li></ol>',
    refundPolicyNote: 'บัตรที่ใช้แล้วไม่สามารถขอคืนเงินได้',
    averageRating: '4.7',
    reviewCount: 143,
    variants: [
      v('var-appstore-300', 'APPSTORE-300', 300, 318.00, true),
      v('var-appstore-500', 'APPSTORE-500', 500, 530.00, true),
    ],
  },
];
