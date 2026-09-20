import Link from 'next/link';
import { Heart } from 'lucide-react';

import { ProductCard } from '@/components/product/ProductCard';
import type { WishRankedProduct } from '@/lib/data';

/**
 * "ลูกค้าคนอื่นก็ถูกใจ" — most-wished products row on the product detail
 * page (client ask: wishlist social proof). Server-rendered from the real
 * wishlist table; hidden entirely when nobody has wished anything yet so
 * the page never shows an empty stub.
 */
export function AlsoWished({ items }: { items: WishRankedProduct[] }): React.JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section className="pb-16" aria-label="สินค้าที่ลูกค้าคนอื่นถูกใจ">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-fg">ลูกค้าคนอื่นก็ถูกใจ</h2>
        <Link href="/search" className="text-sm font-medium text-fg-brand hover:underline">
          ดูทั้งหมด
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {items.map(({ product, wishCount }) => (
          <div key={product.id} className="relative">
            <ProductCard
              id={product.id}
              name={product.name}
              slug={product.slug}
              shortDescription={product.shortDescription}
              imageUrl={product.imageUrl}
              categoryName={product.category.name}
              categorySlug={product.category.slug}
              price={product.variants[0]?.price ?? 0}
              stock={product.variants.reduce((s, v) => s + v.stock, 0)}
              variantId={product.variants[0]?.id}
              variantCount={product.variants.length}
              variants={product.variants.map((v) => ({
                id: v.id,
                label: v.label,
                price: v.price, effectivePrice: v.effectivePrice,
                stock: v.stock,
              }))}
            />
            <span
              className="text-crimson-600 absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold shadow-sm"
              title={`${wishCount} คนบันทึกสินค้านี้ไว้ในรายการโปรด`}
            >
              <Heart size={11} className="fill-crimson-500 text-crimson-500" />
              {wishCount}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
