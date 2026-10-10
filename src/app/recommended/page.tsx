import { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { getFeaturedProducts } from '@/lib/data';
import { publicOrigin } from '@/lib/siteConfig';

export const metadata: Metadata = {
  title: 'สินค้าแนะนำ',
  description: 'สินค้าแนะนำและกำลังเป็นที่นิยมจาก Nong-Kati',
  openGraph: {
    title: 'สินค้าแนะนำ — Nong-Kati',
    description: 'สินค้าแนะนำและกำลังเป็นที่นิยม',
  },
};

export default async function RecommendedPage(): Promise<React.JSX.Element> {
  const featuredProducts = await getFeaturedProducts();

  return (
    <div className="animate-page-enter">
      <Breadcrumb
        items={[
          { label: 'หน้าแรก', href: '/' },
          { label: 'สินค้าแนะนำ' },
        ]}
      />

      <PageShell className="py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">สินค้าแนะนำ</h1>
          <p className="text-sm text-fg-muted">
            {featuredProducts.length} รายการ
          </p>
        </div>

        {featuredProducts.length > 0 ? (
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
                promotion={product.variants[0]?.promotion}
                stock={product.variants.reduce((sum, v) => sum + v.stock, 0)}
                variantId={product.variants[0]?.id}
                variantCount={product.variants.length}
                variants={product.variants.map((v) => ({
                  id: v.id,
                  label: v.label,
                  price: v.effectivePrice,
                  effectivePrice: v.effectivePrice,
                  stock: v.stock,
                  promotion: v.promotion,
                }))}
              />
            ))}
          </ProductGrid>
        ) : (
          <div className="rounded-xl border border-line-subtle bg-surface p-12 text-center">
            <p className="text-lg font-semibold text-fg">ยังไม่มีสินค้าแนะนำ</p>
            <p className="mt-2 text-sm text-fg-muted">
              ทีมงานต้องตั้งสินค้าเป็นสินค้าแนะนำก่อน สินค้าจึงจะแสดงที่หน้านี้
            </p>
            <Link
              href="/search"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-peach-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-peach-400"
            >
              ดูสินค้าทั้งหมด
            </Link>
          </div>
        )}
      </PageShell>
    </div>
  );
}
