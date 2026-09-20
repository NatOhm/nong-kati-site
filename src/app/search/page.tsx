import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { SearchProductCard } from '@/components/product/SearchProductCard';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { CatalogSearchBox } from '@/components/search/CatalogSearchBox';
import { SearchToolbar } from '@/components/search/SearchToolbar';
import { HamsterMascot } from '@/components/ui/ClayIcons';

import { getCatalogProducts, getCategoriesWithProductCounts, type CatalogSort } from '@/lib/data';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; category?: string }>;
}

const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: 'featured', label: 'แนะนำ' },
  { value: 'price-asc', label: 'ราคาต่ำ → สูง' },
  { value: 'price-desc', label: 'ราคาสูง → ต่ำ' },
  { value: 'name-asc', label: 'ชื่อ A → Z' },
  { value: 'newest', label: 'ใหม่มาก่อน' },
];

function buildUrl(params: {
  q?: string | undefined;
  page?: number | undefined;
  sort?: string | undefined;
  category?: string | undefined;
}): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.sort && params.sort !== 'featured') sp.set('sort', params.sort);
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  const s = sp.toString();
  return `/search${s ? `?${s}` : ''}`;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q, category } = await searchParams;
  const query = q || '';

  return {
    title: query ? `ค้นหา "${query}" — Nong-Kati` : 'สินค้าทั้งหมด — Nong-Kati',
    description: query
      ? `ผลการค้นหา "${query}" — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ ออนไลน์`
      : 'เลือกซื้อสินค้าทั้งหมด gift card ออนไลน์ ส่งโค้ดทันที',
    robots: { index: false, follow: true },
    other: category ? { category } : {},
  };
}

export default async function SearchPage({
  searchParams,
}: SearchPageProps): Promise<React.JSX.Element> {
  const { q, page: pageParam, sort: sortParam, category } = await searchParams;
  const query = q || '';
  const page = parseInt(pageParam || '1', 10);
  const limit = 24;
  const sort: CatalogSort = SORT_OPTIONS.find((o) => o.value === sortParam)?.value ?? 'featured';

  let products: Awaited<ReturnType<typeof getCatalogProducts>>['products'] = [];
  let total = 0;
  let categories: Awaited<ReturnType<typeof getCategoriesWithProductCounts>> = [];
  try {
    const result = await getCatalogProducts(query, category, sort, page, limit);
    products = result.products;
    total = result.total;
    categories = await getCategoriesWithProductCounts();
  } catch {
    // DB unavailable — render with empty results
  }
  const totalPages = Math.ceil(total / limit);

  const sortUrl = (sortValue: CatalogSort) =>
    buildUrl({ q: query || undefined, category: category || undefined, sort: sortValue });

  return (
    <>
      <FacebookLayout>
        <main>
          <PageShell>
            {/* Breadcrumb */}
            <Breadcrumb
              className="py-4"
              items={[
                { label: 'หน้าหลัก', href: '/' },
                category
                  ? { label: `หมวดหมู่: ${category}`, href: `/category/${category}` }
                  : { label: query ? 'ค้นหาสินค้า' : 'สินค้าทั้งหมด' },
              ]}
            />

            <h1 className="sr-only">
              {query
                ? `ผลการค้นหา "${query}"`
                : category
                  ? `หมวดหมู่: ${category}`
                  : 'สินค้าทั้งหมด'}
            </h1>

            {/* Reference-grid toolbar (img 2): search left, sort dropdown + 1/N pager right */}
            <section className="pb-4">
              <Suspense fallback={<div className="h-11 w-full md:max-w-md" />}>
                <SearchToolbar
                  page={page}
                  totalPages={totalPages}
                  currentSort={sort}
                  sortOptions={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                >
                  <CatalogSearchBox className="w-full" />
                </SearchToolbar>
              </Suspense>
            </section>

            {/* Category chips */}
            <section className="pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={buildUrl({ q: query || undefined, sort: sortParam })}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    !category
                      ? 'border-peach-500 bg-peach-100 text-peach-800'
                      : 'border-line bg-surface text-fg-secondary hover:border-peach-400 hover:text-fg-brand'
                  }`}
                >
                  ทั้งหมด
                </Link>
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={buildUrl({ q: query || undefined, category: cat.slug, sort: sortParam })}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      category === cat.slug
                        ? 'border-peach-500 bg-peach-100 text-peach-800'
                        : 'border-line bg-surface text-fg-secondary hover:border-peach-400 hover:text-fg-brand'
                    }`}
                  >
                    {cat.name} <span className="text-clay-9000">({cat.productCount})</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Results — dense reference-grid tiles (5 up on desktop) */}
            {products.length > 0 ? (
              <section className="pb-16">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {products.map((product) => (
                    <SearchProductCard
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      slug={product.slug}
                      imageUrl={product.imageUrl}
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
                </div>
              </section>
            ) : query || category ? (
              <section className="py-16 text-center">
                <HamsterMascot size={96} className="mascot-sniff mx-auto mb-4" />
                <h2 className="mb-2 text-lg font-semibold text-fg">
                  {query ? <>ไม่พบสินค้า &ldquo;{query}&rdquo;</> : 'ไม่พบสินค้าในหมวดหมู่นี้'}
                </h2>
                <p className="text-sm text-fg-placeholder">
                  น้องแฮมสเตอร์หาไม่เจอ — ลองค้นหาด้วยคำอื่น หรือเลือกหมวดหมู่อื่น
                </p>
              </section>
            ) : (
              <section className="py-16 text-center">
                <HamsterMascot size={96} className="mascot-sniff mx-auto mb-4" />
                <h2 className="mb-2 text-lg font-semibold text-fg">ยังไม่มีสินค้าในร้าน</h2>
                <p className="text-sm text-fg-placeholder">
                  น้องแฮมสเตอร์กำลังเก็บสินค้ามาวาง — กลับมาใหม่ภายหลังนะ
                </p>
              </section>
            )}
          </PageShell>
        </main>
      </FacebookLayout>

      <Footer />
    </>
  );
}
