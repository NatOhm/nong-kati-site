'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { ProductGrid } from '@/components/product/ProductGrid';
import { ProductCard } from '@/components/product/ProductCard';
import { useCustomerSession } from '@/components/layout/useCustomerSession';
import { HamsterLoader } from '@/components/loading/HamsterLoader';

/**
 * Profile รายการโปรด (wishlist) — the client explicitly asked "ระบบนี้ทำได้ไหม"
 * for saved products. Renders the wished products as buyable cards; hearts
 * here remove items via the same toggle API.
 */
interface WishProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  category: { name: string; slug: string };
  variants: { id: string; price: number; stock: number }[];
}

export default function WishlistPage(): React.JSX.Element {
  const sessionState = useCustomerSession();
  const [products, setProducts] = useState<WishProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionState !== 'authed') return;
    fetch('/api/v1/wishlist', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products?: WishProduct[] }) => {
        setProducts(d.products ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionState]);

  if (sessionState === 'loading' || loading) {
    return <HamsterLoader />;
  }

  if (products.length === 0) {
    return (
      <div className="clay-card flex flex-col items-center gap-4 p-10 text-center">
        <Heart size={44} className="text-coral-300" />
        <h1 className="text-lg font-bold text-fg">ยังไม่มีสินค้าในรายการโปรด</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          กดรูปหัวใจที่สินค้าที่ชอบ เพื่อเก็บไว้ดูภายหลัง
        </p>
        <Link
          href="/search"
          className="clay-btn inline-flex h-11 items-center rounded-full bg-surface-brand px-6 text-sm font-semibold text-fg-inverse shadow-clay-brand transition-all duration-interactive ease-ease-out hover:scale-[1.03] active:scale-[0.96]"
        >
          เลือกซื้อสินค้า
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-fg">รายการโปรด</h1>
      <ProductGrid>
        {products.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            slug={p.slug}
            shortDescription={p.shortDescription}
            imageUrl={p.imageUrl}
            categoryName={p.category.name}
            categorySlug={p.category.slug}
            price={p.variants[0]?.price ?? 0}
            stock={p.variants[0]?.stock ?? 0}
            variantId={p.variants[0]?.id}
            variantCount={p.variants.length}
          />
        ))}
      </ProductGrid>
    </div>
  );
}
