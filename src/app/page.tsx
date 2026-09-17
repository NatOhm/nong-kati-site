import { Metadata } from 'next';
import Link from 'next/link';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryCard } from '@/components/product/CategoryCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { StructuredData } from '@/components/data-display/StructuredData';

// New components
import { MarqueeTicker } from '@/components/home/MarqueeTicker';
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

import { getCategoriesWithProductCounts, getFeaturedProducts } from '@/lib/data';

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
  try {
    categories = await getCategoriesWithProductCounts();
    featuredProducts = await getFeaturedProducts();
  } catch (e) {
    console.error(
      '[HomePage] Database unavailable, rendering with empty data:',
      e instanceof Error ? e.message : e,
    );
  }

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
        {/* Hero — asymmetric: oversized serif headline left, delivered-code card right */}
        <section className="border-b border-line-subtle">
          <div className="grid items-center gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:px-8 md:py-20 lg:gap-16">
            <div>
              <ScrollReveal>
                <h1 className="font-display text-4xl font-bold leading-[1.15] text-fg-brand-strong sm:text-5xl lg:text-6xl">
                  โค้ดเกม สตรีมมิ่ง
                  <br />
                  และอีคอมเมิร์ซ
                  <br />
                  <span className="text-fg-brand">ส่งถึงอีเมลใน 60 วินาที</span>
                </h1>
                <p className="mt-5 max-w-md text-base leading-relaxed text-fg-muted">
                  จ่ายผ่าน PromptPay หรือบัตรเครดิต รหัสสินค้าถูกส่งอัตโนมัติ ไม่ต้องรอแอดมิน
                </p>
                <div className="mt-8">
                  <Link
                    href="/search"
                    className="inline-flex items-center justify-center rounded-full bg-peach-500 px-8 py-3 text-sm font-semibold text-white shadow-clay-brand transition-all hover:bg-peach-400 hover:shadow-clay-lg active:scale-95 active:shadow-clay-press"
                  >
                    เลือกซื้อสินค้า
                  </Link>
                </div>
              </ScrollReveal>
            </div>
            {/* Clay hamster peeking over the CTA card — leans hello on card hover */}
            <div className="group relative">
              <div className="pointer-events-none absolute -top-16 right-2 z-10 animate-float md:-top-20">
                <div className="mascot-hello">
                  <HamsterMascot
                    size={120}
                    className="drop-shadow-[0_10px_18px_rgba(147,107,73,0.35)]"
                  />
                </div>
              </div>
              <DeliveredCodeCard />
            </div>
          </div>
        </section>

        {/* Stats Counter */}
        <StatsCounter />

        <PawDivider className="py-4" />

        {/* Categories Section */}
        <ScrollReveal>
          <section className="px-4 py-6 md:px-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">หมวดหมู่สินค้า</h2>
              <Link
                href="/search"
                className="text-sm font-medium text-fg-brand hover:text-fg-brand"
              >
                ดูทั้งหมด
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  id={cat.id}
                  name={cat.name}
                  slug={cat.slug}
                  icon={cat.icon}
                  productCount={cat.productCount}
                />
              ))}
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
                    price={product.variants[0]?.price ?? 0}
                    stock={product.variants.reduce((sum, v) => sum + v.stock, 0)}
                    variantId={product.variants[0]?.id}
                    variantCount={product.variants.length}
                    variants={product.variants.map((v) => ({
                      id: v.id,
                      label: v.label,
                      price: v.price,
                      stock: v.stock,
                    }))}
                  />
                ))}
              </ProductGrid>
            </section>
          </ScrollReveal>
        )}

        <PawDivider className="py-6" />

        {/* How It Works Section */}
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

        {/* Trust Badges */}
        <ScrollReveal>
          <TrustBadges />
        </ScrollReveal>

        {/* FAQ */}
        <ScrollReveal>
          <FAQAccordion />
        </ScrollReveal>
      </FacebookLayout>

      <Footer />

      {/* Client-side overlays */}
      <LiveSalesPopup />
      <LINEChatButton />
      <ScrollToTop />
    </>
  );
}
