'use client';

import { useEffect } from 'react';

import { rememberProduct, type RecentProduct } from '@/lib/recentlyViewed';

/**
 * Records the product the visitor just opened, for the mobile search sheet's
 * "ดูล่าสุด" row. Renders nothing, so it can sit in a server-rendered page.
 */
export function RecentlyViewedTracker({ product }: { product: RecentProduct }): null {
  const { slug, name, imageUrl, price } = product;

  useEffect(() => {
    rememberProduct({ slug, name, imageUrl, price });
  }, [slug, name, imageUrl, price]);

  return null;
}
