import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { CategoryCard } from '@/components/product/CategoryCard';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { StructuredData } from '@/components/data-display/StructuredData';

import {
  getCategoryBySlug,
  getTopLevelCategories,
  getProductsByCategory,
} from '@/lib/data';

interface CategoryPageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join('/');
  const result = await getCategoryBySlug(slugPath);

  if (!result) {
    return { title: 'ไม่พบหมวดหมู่ — Nong-Kati' };
  }

  const { category } = result;
  const categoryUrl = `${process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com'}/category/${slugPath}`;

  return {
    title: `${category.name} — ซื้อบัตรออนไลน์`,
    description: `ซื้อ ${category.name} ออนไลน์ ส่งโค้ดทันที ราคาดี`,
    openGraph: {
      title: `${category.name} — Nong-Kati`,
      description: `ซื้อ ${category.name} ออนไลน์ ส่งโค้ดทันที`,
      type: 'website',
      url: categoryUrl,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const slugPath = slug.join('/');

  const result = await getCategoryBySlug(slugPath);
  if (!result) notFound();

  const { category, breadcrumb } = result;
  const { products, total } = await getProductsByCategory(slugPath);
  const categories = await getTopLevelCategories();

  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com';
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
              ...breadcrumb.map((b) => ({
                label: b.name,
                href: `/category/${b.slug}`,
              })),
            ]}
          />

          {/* Category Header */}
          <section className="pb-8">
            <h1 className="font-display text-3xl font-bold text-ink-100">
              <span className="mr-2">{category.icon}</span>
              {category.name}
            </h1>
            <p className="mt-2 text-ink-400">
              {total} สินค้า
            </p>
          </section>

          {/* Sub-categories (if L1) */}
          {category.children.length > 0 && (
            <section className="pb-8">
              <h2 className="mb-4 text-lg font-semibold text-ink-200">หมวดหมู่ย่อย</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {category.children.map((child) => (
                  <CategoryCard
                    key={child.id}
                    id={child.id}
                    name={child.name}
                    slug={child.slug}
                    icon={child.icon}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Products */}
          {products.length > 0 ? (
            <section className="pb-16">
              <h2 className="mb-4 text-lg font-semibold text-ink-200">สินค้าทั้งหมด</h2>
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
            </section>
          ) : (
            <section className="py-16 text-center">
              <p className="text-ink-400">ยังไม่มีสินค้าในหมวดหมู่นี้</p>
            </section>
          )}
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
