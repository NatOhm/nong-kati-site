import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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

import { getCategoryBySlug, getProductsByCategory } from '@/lib/data';
import { publicOrigin } from '@/lib/siteConfig';

interface CategoryPageProps {
  params: Promise<{ slug: string[] }>;
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
}: CategoryPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const slugPath = slug.join('/');

  let result: Awaited<ReturnType<typeof getCategoryBySlug>> = null;
  let products: Awaited<ReturnType<typeof getProductsByCategory>>['products'] = [];
  let total = 0;
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
    const catResult = await getProductsByCategory(slugPath);
    products = catResult.products;
    total = catResult.total;
  } catch {
    // Catalogue query failed — the category shell still renders; grid falls
    // back to its own empty state.
  }

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
            <p className="mt-2 text-fg-placeholder">{total} สินค้า</p>
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
              <h2 className="mb-4 text-lg font-semibold text-fg-secondary">สินค้าทั้งหมด</h2>
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
