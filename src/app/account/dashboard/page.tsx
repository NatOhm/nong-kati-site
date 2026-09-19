/**
 * Profile Page (client ask: "Show the account sidebar sections
 * สินค้าทั้งหมด / แนะนำ / รายการโปรด / คำสั่งซื้อ as a proper profile page
 * with tabs instead of only sidebar links"). This route hosts the two
 * product tabs; รายการโปรด and คำสั่งซื้อ are the same tab bar on their own
 * routes, all backed by real APIs:
 *
 *   สินค้าทั้งหมด → GET /api/v1/products              (full live catalog)
 *   แนะนำ        → GET /api/v1/products?sort=featured
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShoppingBag, Sparkles } from 'lucide-react';

import { AccountTabs } from '@/components/account/AccountTabs';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGrid } from '@/components/product/ProductGrid';
import { useCustomerSession } from '@/components/layout/useCustomerSession';
import { HamsterLoader } from '@/components/loading/HamsterLoader';

interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  category: { name: string; slug: string };
  variants: { id: string; label: string; price: number; stock: number }[];
}

export default function ProfilePage(): React.JSX.Element {
  const sessionState = useCustomerSession();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') === 'featured' ? 'featured' : 'all';

  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (sessionState !== 'authed') return;
    let cancelled = false;
    setProducts(null);
    setState('loading');
    fetch(`/api/v1/products?limit=24&sort=${view === 'featured' ? 'featured' : 'name-asc'}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { products: CatalogProduct[] }) => {
        if (!cancelled) {
          setProducts(d.products ?? []);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionState, view]);

  if (sessionState === 'loading') return <HamsterLoader />;

  return (
    <div className="space-y-6">
      {/* Header + tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-fg">โปรไฟล์ของฉัน</h1>
          <Link
            href="/account/overview"
            className="clay-btn inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-semibold text-fg-muted transition-all duration-interactive ease-ease-out hover:scale-[1.03] hover:text-fg active:scale-[0.96]"
          >
            ภาพรวม &amp; กระเป๋าเงิน
          </Link>
        </div>
        <AccountTabs />
      </div>

      {/* ─── สินค้าทั้งหมด / แนะนำ ─── */}
      <section aria-label={view === 'featured' ? 'สินค้าแนะนำ' : 'สินค้าทั้งหมด'}>
        {view === 'featured' ? (
          <p className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
            <Sparkles size={16} className="text-fawn-500" aria-hidden />
            สินค้าที่เราคัดมาแนะนำให้คุณเป็นพิเศษ
          </p>
        ) : (
          <p className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
            <ShoppingBag size={16} aria-hidden />
            ทุกสินค้าในร้าน พร้อมซื้อได้ทันทีจากการ์ด
          </p>
        )}

        {state === 'loading' && <HamsterLoader />}
        {state === 'error' && (
          <div className="clay-card p-8 text-center">
            <p className="text-sm text-fg-muted">โหลดสินค้าไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง</p>
          </div>
        )}
        {state === 'ready' && products && products.length === 0 && (
          <div className="clay-card p-8 text-center">
            <p className="text-sm text-fg-muted">ยังไม่มีสินค้าในร้าน</p>
          </div>
        )}
        {state === 'ready' && products && products.length > 0 && (
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
                stock={p.variants.reduce((sum, v) => sum + v.stock, 0)}
                variantId={p.variants[0]?.id}
                variantCount={p.variants.length}
                variants={p.variants}
              />
            ))}
          </ProductGrid>
        )}
      </section>
    </div>
  );
}
