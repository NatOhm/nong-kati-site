import { Metadata } from 'next';
import Link from 'next/link';

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryCard } from '@/components/product/CategoryCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { StructuredData } from '@/components/data-display/StructuredData';

import {
  getTopLevelCategories,
  getFeaturedProducts,
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
  const categories = await getTopLevelCategories();
  const featuredProducts = await getFeaturedProducts();

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

      <Navbar
        categories={categories.map((c) => ({
          ...c,
          children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
        }))}
      />

      <main>
        {/* Hero Section */}
        <PageShell>
          <section className="flex flex-col items-center gap-6 py-16 text-center md:py-24">
            <h1 className="font-display text-3xl font-bold text-fg-brand-strong md:text-5xl">
              ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ
            </h1>
            <p className="max-w-prose text-lg text-ink-300">
              ส่งโค้ดทันทีภายใน 60 วินาที ชำระผ่าน PromptPay หรือบัตรเครดิต
            </p>
            <div className="flex gap-3">
              <Link
                href="/search?q="
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-6 py-3 text-base font-semibold bg-amber-400 text-ink-900 border border-amber-300/30 shadow-brand-glow hover:bg-amber-300 hover:shadow-brand-glow-hover h-12"
              >
                เลือกซื้อสินค้า
              </Link>
              <Link
                href="/search?q="
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-6 py-3 text-base font-semibold bg-transparent text-amber-300 border border-amber-500 hover:bg-amber-900/40 h-12"
              >
                ค้นหาสินค้า
              </Link>
            </div>
          </section>
        </PageShell>

        {/* Categories Section */}
        <PageShell>
          <section className="py-12">
            <h2 className="mb-6 font-display text-2xl font-bold text-ink-100">
              หมวดหมู่สินค้า
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  id={cat.id}
                  name={cat.name}
                  slug={cat.slug}
                  icon={cat.icon}
                  productCount={cat.children.length}
                />
              ))}
            </div>
          </section>
        </PageShell>

        {/* Featured Products Section */}
        {featuredProducts.length > 0 && (
          <PageShell>
            <section className="py-12">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-ink-100">
                  สินค้าแนะนำ
                </h2>
                <Link href="/search?q=" className="text-sm text-amber-300 hover:underline">
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
                  />
                ))}
              </ProductGrid>
            </section>
          </PageShell>
        )}

        {/* How It Works Section */}
        <PageShell>
          <section className="py-16">
            <h2 className="mb-8 text-center font-display text-2xl font-bold text-ink-100">
              วิธีการซื้อ
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { step: '01', title: 'เลือกสินค้า', desc: 'เลือกประเภทบัตรและราคาที่ต้องการ' },
                { step: '02', title: 'ชำระเงิน', desc: 'จ่ายผ่าน PromptPay หรือบัตรเครดิต' },
                { step: '03', title: 'รับโค้ด', desc: 'รับโค้ดทันทีภายใน 60 วินาที' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex flex-col items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-6 text-center"
                >
                  <span className="text-3xl font-bold text-amber-400">{item.step}</span>
                  <h3 className="text-lg font-semibold text-ink-100">{item.title}</h3>
                  <p className="text-sm text-ink-300">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
