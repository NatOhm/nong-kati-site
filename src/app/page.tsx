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
import { MarqueeTicker } from '@/components/home/MarqueeTicker';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { StatsCounter } from '@/components/home/StatsCounter';
import { TrustBadges } from '@/components/home/TrustBadges';
import { FAQAccordion } from '@/components/home/FAQAccordion';
import { LiveSalesPopup } from '@/components/home/LiveSalesPopup';
import { LINEChatButton } from '@/components/home/LINEChatButton';
import { ScrollToTop } from '@/components/home/ScrollToTop';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { DeliveredCodeCard } from '@/components/home/DeliveredCodeCard';
import { HamsterMascot } from '@/components/ui/ClayIcons';
import { PawDivider } from '@/components/ui/PawDivider';

import {
  getCategoriesWithProductCounts,
  getFeaturedProducts,
  getHeroSlides,
  getStorefrontStats,
} from '@/lib/data';

export const metadata: Metadata = {
  title: 'ซื้อบัตรเกม Netflix Steam และอีคอมเมิร์ซ — Nong-Kati',
  description:
    'ซื้อ gift card ออนไลน์ ส่งโค้ดทันที ครอบคลุม เกม สตรีมมิ่ง และ อีคอมเมิร์ซ ราคาดี จ่ายผ่าน PromptPay และบัตรเครดิต',
  openGraph: {
    title: 'Nong-Kati — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ',
    description: 'ส่งโค้ดทันที ราคาดี จ่ายผ่าน PromptPay และบัตรเครดิต',
    type: 'website',
    locale: 'th_TH',
  },
};

export default async function HomePage(): Promise<React.JSX.Element> {
  let categories: Awaited<ReturnType<typeof getCategoriesWithProductCounts>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  let heroSlides: Awaited<ReturnType<typeof getHeroSlides>> = [];
  let stats: Awaited<ReturnType<typeof getStorefrontStats>> | null = null;
  try {
    categories = await getCategoriesWithProductCounts();
    featuredProducts = await getFeaturedProducts();
    heroSlides = await getHeroSlides();
    stats = await getStorefrontStats();
  } catch (e) {
    console.error(
      '[HomePage] Database unavailable, rendering with empty data:',
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

      {/* Marquee Ticker */}
      <MarqueeTicker />

      <FacebookLayout>
        {/* Hero carousel — admin-managed promo banners (hidden until configured) */}
        {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

        {/* Announcement board — the headline framed as a notice board (client ask) */}
        <section className="px-4 pt-8 md:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border-2 border-dashed border-peach-300 bg-peach-50 px-6 py-5 text-center shadow-clay-sm dark:border-peach-700/60 dark:bg-peach-900/20">
            <p className="font-display text-xl font-bold leading-snug text-fg-brand-strong sm:text-2xl">
              📢 โค้ดเกม สตรีมมิ่ง และอีคอมเมิร์ซ ส่งถึงอีเมลใน 60 วินาที
            </p>
            <p className="mt-1.5 text-sm text-fg-muted">
              จ่ายผ่าน PromptPay หรือบัตรเครดิต รหัสสินค้าถูกส่งอัตโนมัติ ไม่ต้องรอแอดมิน
            </p>
            <Link
              href="/search"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-peach-500 px-8 py-2.5 text-sm font-semibold text-white shadow-clay-brand transition-all hover:bg-peach-400 hover:shadow-clay-lg active:scale-95 active:shadow-clay-press"
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
                { step: '02', title: 'ชำระเงิน', desc: 'จ่ายผ่าน PromptPay หรือบัตรเครดิต' },
                { step: '03', title: 'รับโค้ด', desc: 'รับโค้ดทันทีภายใน 60 วินาที' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="clay-card flex items-center gap-4 rounded-xl p-4 transition-transform duration-fast ease-out-quart hover:-translate-y-0.5"
                >
                  <span className="shrink-0 text-2xl font-bold text-peach-500">{item.step}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{item.title}</h3>
                    <p className="text-xs text-fg-muted">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* Categories Section */}

        {/* Promotion banner — directly under วิธีการซื้อ (client ask) */}
        <MarqueeTicker />

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
                className="text-sm font-medium text-fg-brand hover:text-fg-brand"
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
                  className="text-sm font-medium text-fg-brand hover:text-fg-brand"
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

        {/* Stats — real counts, plain numbers, horizontal, at the bottom (client ask) */}
        <StatsCounter
          stats={
            stats
              ? [
                  { value: stats.customers, label: 'ลูกค้า' },
                  { value: stats.products, label: 'สินค้า' },
                  { value: stats.itemsSold, label: 'ขายแล้ว' },
                  { value: stats.stock, label: 'สต๊อก' },
                ]
              : undefined
          }
        />
      </FacebookLayout>

      <Footer />

      {/* Client-side overlays */}
      <LiveSalesPopup />
      <LINEChatButton />
      <ScrollToTop />
    </>
  );
}
