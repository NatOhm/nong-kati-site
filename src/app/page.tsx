import { Metadata } from 'next';
import Link from 'next/link';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';
import { ProductCard } from '@/components/product/ProductCard';
import { AppTile } from '@/components/product/AppTile';
import { ProductGrid } from '@/components/product/ProductGrid';
import { StructuredData } from '@/components/data-display/StructuredData';

// New components
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { StatsCounter } from '@/components/home/StatsCounter';
import { TrustBadges } from '@/components/home/TrustBadges';
import { FAQAccordion } from '@/components/home/FAQAccordion';
import { LINEChatButton } from '@/components/home/LINEChatButton';
import { ScrollToTop } from '@/components/home/ScrollToTop';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { PawDivider } from '@/components/ui/PawDivider';

import {
  getCategoriesWithProductCounts,
  getFeaturedProducts,
  getHeroSlides,
  getStorefrontStats,
} from '@/lib/data';

export const metadata: Metadata = {
  // No manual brand suffix — the root template appends "— Nong-Kati" (audit #12).
  title: 'ซื้อบัตรเกม Netflix Steam และอีคอมเมิร์ซ',
  description:
    'ซื้อ gift card ออนไลน์ ส่งโค้ดทันที ครอบคลุม เกม สตรีมมิ่ง และ อีคอมเมิร์ซ ราคาดี โอนเงินพร้อมส่งสลิปยืนยัน',
  openGraph: {
    title: 'Nong-Kati — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ',
    description: 'ส่งโค้ดทันที ราคาดี โอนเงินพร้อมส่งสลิปยืนยัน',
    type: 'website',
    locale: 'th_TH',
  },
};

export default async function HomePage(): Promise<React.JSX.Element> {
  let categories: Awaited<ReturnType<typeof getCategoriesWithProductCounts>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  let heroSlides: Awaited<ReturnType<typeof getHeroSlides>> = [];
  let stats: Awaited<ReturnType<typeof getStorefrontStats>> | null = null;
  let dbDown = false;
  try {
    categories = await getCategoriesWithProductCounts();
    featuredProducts = await getFeaturedProducts();
    heroSlides = await getHeroSlides();
    stats = await getStorefrontStats();
  } catch (e) {
    dbDown = true;
    console.error(
      '[HomePage] Database unavailable, rendering degraded state:',
      e instanceof Error ? e.message : e,
    );
  }

  // App tiles = the leaf app categories (13 apps); type-groups wrap them.
  const appCategories = categories.flatMap((root) =>
    root.children.length > 0 ? root.children : [root],
  );

  return (
    <>
      <StructuredData
        type="organization"
        data={{
          name: 'Nong-Kati',
          url: process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com',
          description: 'ซื้อ gift card ออนไลน์ ส่งโค้ดทันที',
        }}
      />

      <FacebookLayout>
        {/* Hero carousel — admin-managed promo banners (hidden until configured) */}
        {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

        {/* Announcement board — the headline framed as a notice board (client ask) */}
        <section className="px-4 pt-8 md:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border-2 border-dashed border-peach-300 bg-peach-50 px-6 py-5 text-center shadow-clay-sm dark:border-peach-700/60 dark:bg-peach-900/20">
            {/* Site-wide h1 (landmark spec): the notice-board headline is the
                page's main heading — p→h1 keeps the identical clay styling. */}
            <h1 className="font-display text-xl font-bold leading-snug text-fg-brand-strong sm:text-2xl">
              โค้ดเกม สตรีมมิ่ง และอีคอมเมิร์ซ ส่งถึงอีเมลหลังยืนยันการชำระเงิน
            </h1>
            {/* clay-700 lands exactly 4.50 on the peach-50 card — use clay-800
                for headroom (7.11). Dark keeps the muted token. */}
            <p className="mt-1.5 text-sm text-clay-800 dark:text-fg-muted">
              โอนเงินแล้วอัปโหลดสลิป ทีมงานยืนยันและส่งโค้ดให้ทันที
            </p>
            <Link
              href="/search"
              className="transition-smart mt-4 inline-flex items-center justify-center rounded-full bg-peach-500 px-8 py-2.5 text-sm font-semibold text-white shadow-clay-brand hover:bg-peach-400 hover:shadow-clay-lg active:scale-95 active:shadow-clay-press"
            >
              เลือกซื้อสินค้า
            </Link>
          </div>
        </section>

        {/* How It Works — วิธีการซื้อ moved to the very top (client ask) */}
        <ScrollReveal>
          <section className="px-4 py-8 md:px-8">
            <h2 className="mb-6 text-center text-lg font-bold text-fg">วิธีการซื้อ</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { step: '01', title: 'เลือกสินค้า', desc: 'เลือกประเภทบัตรและราคาที่ต้องการ' },
                { step: '02', title: 'ชำระเงิน', desc: 'โอนเงินแล้วส่งสลิปยืนยัน' },
                { step: '03', title: 'รับโค้ด', desc: 'รับโค้ดหลังยืนยันการชำระเงิน' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="clay-card flex items-center gap-4 rounded-xl p-4 transition-transform duration-fast ease-out-quart hover:-translate-y-0.5"
                >
                  <span className="text-2xl font-bold text-peach-700 dark:text-peach-200">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{item.title}</h3>
                    <p className="text-xs text-fg-muted">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* Data-outage alert (audit round 2 #4): during a DB outage the
            catalogue region must not silently render as an empty shop — an
            explicit recoverable alert replaces it. Server-rendered anchors
            only (no client handlers in this tree). */}
        {dbDown && (
          <section role="alert" className="px-4 pb-4 md:px-8">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-coral-300 bg-coral-50 px-6 py-6 text-center">
              <p className="text-lg font-bold text-fg">โหลดสินค้าไม่สำเร็จ</p>
              <p className="text-base text-fg-muted">
                ช่วงนี้ระบบขัดข้องชั่วคราว (ไม่ใช่เพราะสินค้าหมด) — ลองรีเฟรชอีกครั้ง
                หรือแวะร้านใหม่ภายหลัง
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/"
                  className="transition-smart inline-flex min-h-[44px] items-center justify-center rounded-full bg-peach-500 px-6 text-sm font-semibold text-white shadow-clay-sm hover:bg-peach-400"
                >
                  ลองอีกครั้ง
                </Link>
                <Link
                  href="/orders/lookup"
                  className="transition-smart inline-flex min-h-[44px] items-center justify-center rounded-full border border-line bg-surface px-6 text-sm font-semibold text-fg hover:border-clay-400"
                >
                  ค้นหาคำสั่งซื้อเดิม
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Categories Section */}

        <PawDivider className="py-4" />

        {/* App-tile grid — dark panel like the client mockup: artwork tiles
            per app, จำนวน pill, single-product apps go straight to the
            package page; multi-product apps open the category */}
        <ScrollReveal>
          <section className="px-4 py-6 md:px-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">หมวดเมนูแยกตามแอป</h2>
              <Link
                href="/search"
                className="text-sm font-medium text-fg-brand-strong hover:text-fg-brand-strong"
              >
                ดูทั้งหมด
              </Link>
            </div>
            <div className="shadow-clay-md rounded-2xl bg-clay-950 p-4">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {appCategories.map((cat) => (
                  <AppTile
                    key={cat.id}
                    name={cat.name}
                    slug={cat.slug}
                    icon={cat.icon}
                    imageUrl={cat.imageUrl}
                    productSlug={cat.productSlug}
                    productCount={cat.productCount}
                  />
                ))}
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* Featured Products Section */}
        {featuredProducts.length > 0 && (
          <ScrollReveal>
            <section className="px-4 py-6 md:px-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-fg">สินค้าแนะนำ</h2>
                <Link
                  href="/search?q="
                  className="text-sm font-medium text-fg-brand-strong hover:text-fg-brand-strong"
                >
                  ดูทั้งหมด →
                </Link>
              </div>
              <ProductGrid>
                {featuredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    slug={product.slug}
                    shortDescription={product.shortDescription}
                    imageUrl={product.imageUrl}
                    categoryName={product.category.name}
                    categorySlug={product.category.slug}
                    price={product.variants[0]?.effectivePrice ?? 0}
                    stock={product.variants.reduce((sum, v) => sum + v.stock, 0)}
                    variantId={product.variants[0]?.id}
                    variantCount={product.variants.length}
                    variants={product.variants.map((v) => ({
                      id: v.id,
                      label: v.label,
                      price: v.effectivePrice,
                      effectivePrice: v.effectivePrice,
                      stock: v.stock,
                    }))}
                  />
                ))}
              </ProductGrid>
            </section>
          </ScrollReveal>
        )}

        <PawDivider className="py-6" />

        {/* Trust Badges */}
        <ScrollReveal>
          <TrustBadges />
        </ScrollReveal>

        {/* FAQ */}
        <ScrollReveal>
          <FAQAccordion />
        </ScrollReveal>

        {/* Stats — real counts, plain numbers, horizontal, at the bottom (client ask).
            Hidden entirely during an outage: zero rows read as “no business”
            (audit round 2 #4) — they return with the data. */}
        {stats && (
          <StatsCounter
            stats={[
              { value: stats.customers, label: 'ลูกค้า' },
              { value: stats.products, label: 'สินค้า' },
              { value: stats.itemsSold, label: 'ขายแล้ว' },
              { value: stats.stock, label: 'สต๊อก' },
            ]}
          />
        )}
      </FacebookLayout>

      <Footer />

      {/* Client-side overlays */}
      <LINEChatButton />
      <ScrollToTop />
    </>
  );
}
