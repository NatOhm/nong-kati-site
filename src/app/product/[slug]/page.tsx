import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { FacebookLayout } from '@/components/layout/FacebookLayout';

export const dynamic = 'force-dynamic';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { StructuredData } from '@/components/data-display/StructuredData';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { formatThb } from '@/utils/format';

import { getProductBySlug, getProductWishCount, getMostWishedProducts } from '@/lib/data';
import { WishCounterBadge } from '@/components/product/WishCounterBadge';
import { AlsoWished } from '@/components/product/AlsoWished';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof getProductBySlug>> = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    return { title: 'สินค้า — Nong-Kati' };
  }

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

export default async function ProductPage({
  params,
}: ProductPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof getProductBySlug>> = null;
  try {
    product = await getProductBySlug(slug);
    if (!product) notFound();
  } catch {
    // DB unavailable — render error state
    return (
      <>
        <FacebookLayout>
          <PageShell>
            <section className="py-16 text-center">
              <h1 className="text-2xl font-bold text-fg">ไม่พบสินค้า</h1>
              <p className="mt-4 text-fg-placeholder">ไม่สามารถโหลดข้อมูลได้ในขณะนี้</p>
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
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com';
  const productUrl = `${siteUrl}/product/${slug}`;
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  // Social proof: real wishlist table (both degrade gracefully to empty).
  const [wishCount, alsoWished] = await Promise.all([
    getProductWishCount(product.id).catch(() => 0),
    getMostWishedProducts(product.id, 6).catch(() => []),
  ]);

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
            availability:
              totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
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

      <FacebookLayout>
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

          {/* Product Detail — reference layout (img 2): wide banner + overlaid
              title/heart left with description under it; numbered buy steps right */}
          <div className="grid gap-8 pb-16 md:grid-cols-5">
            {/* Banner + description */}
            <div className="flex flex-col gap-5 md:col-span-2">
              <div className="relative overflow-hidden rounded-2xl border border-line-subtle bg-surface shadow-clay-sm">
                <div className="aspect-[16/9] w-full">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-6xl opacity-40">🎮</span>
                    </div>
                  )}
                </div>
                {/* Title over a scrim (img 2) — heart stays clickable */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-4 pb-3.5 pt-14">
                  <h1 className="font-display text-xl font-bold text-white drop-shadow-sm md:text-2xl">
                    {product.name}
                  </h1>
                </div>
                <div className="absolute bottom-3.5 right-3.5">
                  <WishCounterBadge productId={product.id} initialCount={wishCount} />
                </div>
              </div>

              {/* Description under the banner (img 2) */}
              {product.description && (
                <div className="max-w-none text-sm leading-relaxed text-fg-muted">
                  <p>{product.description}</p>
                </div>
              )}

              {/* Tags — free-form labels beyond the category (client ask) */}
              {product.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {product.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full bg-peach-100 px-2.5 py-1 text-xs font-medium text-peach-800"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Buy steps */}
            <div className="md:col-span-3">
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

          {/* Wishlist social proof — most-wished products (hidden when empty) */}
          <AlsoWished items={alsoWished} />
        </PageShell>
      </FacebookLayout>

      <Footer />
    </>
  );
}
