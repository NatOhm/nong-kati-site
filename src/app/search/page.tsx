import { Metadata } from 'next';
import Link from 'next/link';

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';
import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';

import {
  searchProducts,
  getTopLevelCategories,
} from '@/lib/data';

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q || '';

  return {
    title: query ? `ค้นหา "${query}" — Nong-Kati` : 'ค้นหาสินค้า — Nong-Kati',
    description: query
      ? `ผลการค้นหา "${query}" — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ ออนไลน์`
      : 'ค้นหาสินค้า gift card ออนไลน์ ส่งโค้ดทันที',
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps): Promise<React.JSX.Element> {
  const { q, page: pageParam } = await searchParams;
  const query = q || '';
  const page = parseInt(pageParam || '1', 10);
  const limit = 24;

  const { products, total } = await searchProducts(query, page, limit);
  const totalPages = Math.ceil(total / limit);
  const categories = await getTopLevelCategories();

  return (
    <>
      <Navbar
        categories={categories.map((c) => ({
          ...c,
          children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
        }))}
      />

      <main>
        <PageShell>
          {/* Breadcrumb */}
          <Breadcrumb
            className="py-4"
            items={[
              { label: 'หน้าหลัก', href: '/' },
              { label: 'ค้นหาสินค้า' },
            ]}
          />

          {/* Search Header */}
          <section className="pb-8">
            <h1 className="font-display text-2xl font-bold text-ink-100">
              {query ? (
                <>ผลการค้นหา &ldquo;{query}&rdquo;</>
              ) : (
                'ค้นหาสินค้า'
              )}
            </h1>
            {query && (
              <p className="mt-2 text-ink-400">
                พบ {total} รายการ
              </p>
            )}
          </section>

          {/* Results */}
          {products.length > 0 ? (
            <section className="pb-16">
              <ProductGrid>
                {products.map((product) => (
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {page > 1 && (
                    <Link
                      href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}
                      className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-ink-200 hover:border-amber-700 hover:text-amber-300"
                    >
                      ← ก่อนหน้า
                    </Link>
                  )}
                  <span className="text-sm text-ink-400">
                    หน้า {page} จาก {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
                      className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-ink-200 hover:border-amber-700 hover:text-amber-300"
                    >
                      ถัดไป →
                    </Link>
                  )}
                </div>
              )}
            </section>
          ) : query ? (
            <section className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink-800">
                <span className="text-2xl">🔍</span>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-ink-100">
                ไม่พบสินค้า &ldquo;{query}&rdquo;
              </h2>
              <p className="text-sm text-ink-400">
                ลองค้นหาด้วยคำอื่น หรือตรวจสอบการสะกดคำ
              </p>
            </section>
          ) : (
            <section className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink-800">
                <span className="text-2xl">🔍</span>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-ink-100">
                ป้อนคำค้นหา
              </h2>
              <p className="text-sm text-ink-400">
                พิมพ์ชื่อสินค้าหรือหมวดหมู่ที่ต้องการค้นหา
              </p>
            </section>
          )}
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
