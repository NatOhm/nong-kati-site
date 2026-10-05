import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

import { FacebookLayout } from '@/components/layout/FacebookLayout';

export const dynamic = 'force-dynamic';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { AppTile } from '@/components/product/AppTile';
import { CategoryIcon } from '@/components/product/CategoryIcon';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { StructuredData } from '@/components/data-display/StructuredData';
import { SearchToolbar } from '@/components/search/SearchToolbar';

import { getCategoryBySlug, getProductsByCategory, type CatalogSort } from '@/lib/data';
import { publicOrigin } from '@/lib/siteConfig';

interface CategoryPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ sort?: string; page?: string; available?: string }>;
}

/**
 * Category sort menu (review #3). Availability is NOT an option here: it
 * already leads every sort in the query, so an in-stock product can never
 * be buried by sold-out ones regardless of which sort is chosen.
 */
const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: 'featured', label: 'แนะนำ' },
  { value: 'available', label: 'มีของเยอะก่อน' },
  { value: 'price-asc', label: 'ราคาต่ำ → สูง' },
  { value: 'price-desc', label: 'ราคาสูง → ต่ำ' },
  { value: 'name-asc', label: 'ชื่อ A → Z' },
  { value: 'newest', label: 'ใหม่มาก่อน' },
];

const PAGE_SIZE = 24;

function buildCategoryUrl(
  base: string,
  params: { sort?: string | undefined; page?: number | undefined; available?: boolean | undefined },
): string {
  const sp = new URLSearchParams();
  if (params.sort && params.sort !== 'featured') sp.set('sort', params.sort);
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  if (params.available) sp.set('available', '1');
  const s = sp.toString();
  return `${base}${s ? `?${s}` : ''}`;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join('/');
  let result: Awaited<ReturnType<typeof getCategoryBySlug>> = null;
  try {
    result = await getCategoryBySlug(slugPath);
  } catch {
    return { title: 'หมวดหมู่' };
  }

  // Metadata runs before any Suspense flush — notFound() here is what makes
  // a missing category a genuine 404 instead of a soft-404 HTTP 200.
  if (!result) {
    notFound();
  }

  const { category } = result;
  const categoryUrl = `${publicOrigin()}/category/${slugPath}`;

  return {
    title: `${category.name} — ซื้อบัตรออนไลน์`,
    description: `ซื้อ ${category.name} ออนไลน์ ราคาดี โอนเงินแล้วทีมงานยืนยันและส่งโค้ด`,
    alternates: { canonical: categoryUrl },
    openGraph: {
      title: category.name,
      description: `ซื้อ ${category.name} ออนไลน์ โอนเงินแล้วทีมงานยืนยันและส่งโค้ด`,
      type: 'website',
      url: categoryUrl,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { sort: sortParam, page: pageParam, available } = await searchParams;
  const slugPath = slug.join('/');
  const categoryPath = `/category/${slugPath}`;

  const sort: CatalogSort = SORT_OPTIONS.find((o) => o.value === sortParam)?.value ?? 'featured';
  const parsedPage = Number.parseInt(pageParam ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  // ?available=1 → hide sold-out products entirely (review #3). Anything
  // else, including a junk value, keeps them visible.
  const availableOnly = available === '1';

  let result: Awaited<ReturnType<typeof getCategoryBySlug>> = null;
  let products: Awaited<ReturnType<typeof getProductsByCategory>>['products'] = [];
  let total = 0;
  let dbDown = false;
  try {
    result = await getCategoryBySlug(slugPath);
  } catch {
    // DB unavailable — render a retryable error state (not an empty shop).
    // notFound() stays OUTSIDE the catch: it throws Next's control-flow error
    // and a catch here would swallow it (audit 2026-09-28, same bug as the
    // product page).
    return (
      <>
        <FacebookLayout>
          <PageShell>
            <section className="py-16 text-center">
              <h1 className="text-2xl font-bold text-fg">โหลดหมวดหมู่ไม่สำเร็จ</h1>
              <p className="mt-4 text-fg-muted">ลองรีเฟรชอีกครั้ง หรือกลับมาใหม่ภายหลัง</p>
              <Link href="/" className="mt-4 inline-block text-fg-brand hover:underline">
                กลับหน้าหลัก
              </Link>
            </section>
          </PageShell>
        </FacebookLayout>
        <Footer />
      </>
    );
  }
  if (!result) notFound();
  try {
    const catResult = await getProductsByCategory(
      slugPath,
      page,
      PAGE_SIZE,
      sort,
      availableOnly,
    );
    products = catResult.products;
    total = catResult.total;
  } catch {
    // Catalogue query failed — the category shell still renders; grid falls
    // back to its own empty state. The sort/pager controls are hidden in
    // this state for the same reason the search page hides them (audit #6):
    // they would operate on nothing.
    dbDown = true;
  }
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { category, breadcrumb } = result!;

  const siteUrl = publicOrigin();
  const categoryUrl = `${siteUrl}/category/${slugPath}`;

  return (
    <>
      <StructuredData
        type="organization"
        data={{
          name: 'Nong-Kati',
          url: siteUrl,
        }}
      />

      <FacebookLayout>
        <PageShell>
          {/* Breadcrumb */}
          <Breadcrumb
            className="py-4"
            items={[
              { label: 'หน้าหลัก', href: '/' },
              ...breadcrumb.map((b) => ({
                label: b.name,
                href: `/category/${b.slug}`,
              })),
            ]}
          />

          {/* Category Header */}
          <section className="pb-8">
            <h1 className="font-display text-3xl font-bold text-fg">
              <span className="mr-2 inline-flex translate-y-0.5" aria-hidden="true">
                <CategoryIcon name={category.icon} size={28} className="text-fg-brand" />
              </span>
              {category.name}
            </h1>
            <p className="mt-2 text-fg-placeholder">
              {total} สินค้า
              {availableOnly && ' (เฉพาะที่มีของ)'}
            </p>
          </section>

          {/* Sub-apps as dark app tiles (client mockup: artwork + จำนวน pill) */}
          {category.children.length > 0 && (
            <section className="pb-8">
              <div className="shadow-clay-md mb-3 rounded-2xl bg-clay-950 p-4">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {category.children.map((child) => (
                    <AppTile
                      key={child.id}
                      name={child.name}
                      slug={child.slug}
                      icon={child.icon}
                      imageUrl={child.imageUrl}
                      productSlug={child.productSlug}
                      productCount={child.productCount ?? 0}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Products — leaf app pages only; group pages show tiles instead of
              the repeated-card rows the client crossed out in the mockup */}
          {category.children.length === 0 && products.length > 0 ? (
            <section className="pb-16">
              {/* Sort + pager + "available only" (review #3). Before this the
                  category page had NO controls at all: it always rendered the
                  newest 24 products by `createdAt desc` and silently truncated
                  everything past that. Reuses the search page's gated toolbar
                  (useId'd label, listbox semantics, 40px targets) instead of a
                  second implementation. */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg-secondary">สินค้าทั้งหมด</h2>
                {availableOnly ? (
                  <Link
                    href={buildCategoryUrl(categoryPath, { sort: sortParam, page })}
                    className="inline-flex min-h-[40px] items-center rounded-full border border-line-brand bg-peach-50 px-3 py-1.5 text-sm font-medium text-fg-brand"
                    aria-pressed="true"
                  >
                    ✓ เฉพาะที่มีของ
                  </Link>
                ) : (
                  <Link
                    href={buildCategoryUrl(categoryPath, {
                      sort: sortParam,
                      page,
                      available: true,
                    })}
                    className="inline-flex min-h-[40px] items-center rounded-full border border-line px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:border-line-brand hover:text-fg-brand"
                  >
                    เฉพาะที่มีของ
                  </Link>
                )}
              </div>

              {totalPages > 1 && (
                <div className="mb-4">
                  <Suspense fallback={null}>
                    <SearchToolbar
                      page={page}
                      totalPages={dbDown ? 1 : totalPages}
                      currentSort={sort}
                      sortOptions={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      hideControls={dbDown}
                      basePath={categoryPath}
                    />
                  </Suspense>
                </div>
              )}

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
          ) : category.children.length > 0 ? (
            <></>
          ) : (
            <section className="py-16 text-center">
              <p className="text-fg-placeholder">ยังไม่มีสินค้าในหมวดหมู่นี้</p>
            </section>
          )}
        </PageShell>
      </FacebookLayout>

      <Footer />
    </>
  );
}
