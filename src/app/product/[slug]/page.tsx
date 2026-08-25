import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { StructuredData } from '@/components/data-display/StructuredData';
import { StockBadge } from '@/components/product/StockBadge';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { formatThb } from '@/utils/format';

import {
  getProductBySlug,
  getTopLevelCategories,
} from '@/lib/data';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: 'ไม่พบสินค้า — Nong-Kati' };
  }

  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com';
  const productUrl = `${siteUrl}/product/${slug}`;

  return {
    title: `${product.name} — ซื้อบัตรออนไลน์`,
    description: product.shortDescription || `ซื้อ ${product.name} ออนไลน์ ส่งโค้ดทันที`,
    openGraph: {
      title: `${product.name} — Nong-Kati`,
      description: product.shortDescription || `ซื้อ ${product.name} ออนไลน์`,
      type: 'website',
      url: productUrl,
      ...(product.imageUrl && { images: [{ url: product.imageUrl }] }),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const categories = await getTopLevelCategories();
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com';
  const productUrl = `${siteUrl}/product/${slug}`;
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <>
      <StructuredData
        type="product"
        data={{
          name: product.name,
          description: product.description || product.shortDescription || '',
          url: productUrl,
          image: product.imageUrl || undefined,
          brand: 'Nong-Kati',
          category: product.category.name,
          offers: {
            price: product.variants[0]?.price ?? 0,
            priceCurrency: 'THB',
            availability: totalStock > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: productUrl,
          },
        }}
      />

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
              { label: product.category.name, href: `/category/${product.category.slug}` },
              { label: product.name },
            ]}
          />

          {/* Product Detail */}
          <div className="grid gap-8 pb-16 md:grid-cols-2">
            {/* Image */}
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 text-ink-500">
                  <span className="text-6xl">🎮</span>
                  <span className="text-sm">ไม่มีรูปภาพ</span>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col gap-6">
              {/* Category tag */}
              <Link
                href={`/category/${product.category.slug}`}
                className="text-sm font-medium text-amber-400 hover:text-amber-300"
              >
                {product.category.name}
              </Link>

              {/* Title */}
              <h1 className="font-display text-2xl font-bold text-ink-50 md:text-3xl">
                {product.name}
              </h1>

              {/* Stock badge */}
              <div>
                <StockBadge stock={totalStock} />
              </div>

              {/* Description */}
              {product.description && (
                <div className="prose prose-invert max-w-none text-sm text-ink-300">
                  <p>{product.description}</p>
                </div>
              )}

              {/* Interactive Product Details (variant selection, add to cart) */}
              <ProductDetailClient
                productId={product.id}
                productName={product.name}
                productSlug={product.slug}
                categorySlug={product.category.slug}
                categoryName={product.category.name}
                thumbnailUrl={product.imageUrl}
                variants={product.variants}
              />
            </div>
          </div>
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
