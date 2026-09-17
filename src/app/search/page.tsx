import { Metadata } from 'next';
import Link from 'next/link';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { MascotImage } from '@/components/ui/MascotImage';

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

  // Build sort control that preserves current query/category
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

            {/* Header */}
            <section className="pb-6">
              <h1 className="font-display text-2xl font-bold text-fg">
                {query ? (
                  <>ผลการค้นหา &ldquo;{query}&rdquo;</>
                ) : category ? (
                  <>หมวดหมู่: {category}</>
                ) : (
                  'สินค้าทั้งหมด'
                )}
              </h1>
              <p className="mt-2 text-fg-placeholder">พบ {total} รายการ</p>
            </section>

            {/* Category chips + sort */}
            <section className="pb-6">
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

              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-fg-placeholder">เรียงตาม:</span>
                {SORT_OPTIONS.map((opt) => (
                  <Link
                    key={opt.value}
                    href={sortUrl(opt.value)}
                    className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                      sort === opt.value
                        ? 'bg-peach-100 font-semibold text-fg-brand'
                        : 'text-fg-muted hover:bg-surface hover:text-fg'
                    }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    {page > 1 && (
                      <Link
                        href={buildUrl({
                          q: query || undefined,
                          category: category || undefined,
                          sort: sortParam,
                          page: page - 1,
                        })}
                        className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary hover:border-peach-400 hover:text-fg-brand"
                      >
                        ← ก่อนหน้า
                      </Link>
                    )}
                    <span className="text-sm text-fg-placeholder">
                      หน้า {page} จาก {totalPages}
                    </span>
                    {page < totalPages && (
                      <Link
                        href={buildUrl({
                          q: query || undefined,
                          category: category || undefined,
                          sort: sortParam,
                          page: page + 1,
                        })}
                        className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary hover:border-peach-400 hover:text-fg-brand"
                      >
                        ถัดไป →
                      </Link>
                    )}
                  </div>
                )}
              </section>
            ) : query || category ? (
              <section className="py-16 text-center">
                <MascotImage
                  size={72}
                  className="mascot-sniff mx-auto mb-4 shadow-clay-sm"
                  alt=""
                />
                <h2 className="mb-2 text-lg font-semibold text-fg">
                  {query ? <>ไม่พบสินค้า &ldquo;{query}&rdquo;</> : 'ไม่พบสินค้าในหมวดหมู่นี้'}
                </h2>
                <p className="text-sm text-fg-placeholder">
                  น้องแฮมสเตอร์หาไม่เจอ — ลองค้นหาด้วยคำอื่น หรือเลือกหมวดหมู่อื่น
                </p>
              </section>
            ) : (
              <section className="py-16 text-center">
                <MascotImage
                  size={72}
                  className="mascot-sniff mx-auto mb-4 shadow-clay-sm"
                  alt=""
                />
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
