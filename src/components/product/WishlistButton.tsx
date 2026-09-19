'use client';

import { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useCustomerSession } from '@/components/layout/useCustomerSession';

/**
 * One wishlist fetch shared by every mounted heart (a grid mounts ~24 of
 * them) instead of one request per card. Reset on toggle so the cache
 * reflects the server.
 */
let wishlistIdsPromise: Promise<Set<string>> | null = null;
function fetchWishlistIds(): Promise<Set<string>> {
  if (!wishlistIdsPromise) {
    wishlistIdsPromise = fetch('/api/v1/wishlist?idsOnly=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { productIds: [] }))
      .then((d: { productIds?: string[] }) => new Set(d.productIds ?? []))
      .catch(() => new Set<string>());
  }
  return wishlistIdsPromise;
}
function mutateWishlistCache(productId: string, wished: boolean): void {
  if (!wishlistIdsPromise) return;
  void wishlistIdsPromise.then((set) => {
    if (wished) set.add(productId);
    else set.delete(productId);
  });
}

/**
 * Wishlist heart — the client's รายการโปรด toggle (client ask: "ระบบนี้ทำได้ไหม" — yes).
 * Guest hearts bounce to login with ?next= back to this page. Optimistic flip,
 * reverted on API failure. Squishes like every clay control.
 */
export function WishlistButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}): React.JSX.Element {
  const sessionState = useCustomerSession();
  const [wished, setWished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    if (sessionState !== 'authed' || known) return;
    let cancelled = false;
    fetchWishlistIds().then((ids) => {
      if (!cancelled) {
        setWished(ids.has(productId));
        setKnown(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionState, productId, known]);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (sessionState !== 'authed') {
      window.location.href = `/account/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setBusy(true);
    const next = !wished;
    setWished(next); // optimistic
    try {
      const res = await fetch('/api/v1/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { wished: boolean; wishCount?: number };
      setWished(data.wished);
      mutateWishlistCache(productId, data.wished);
      // Detail page's WishCounterBadge listens for this to show the live count.
      if (typeof data.wishCount === 'number') {
        window.dispatchEvent(
          new CustomEvent('nk-wish', {
            detail: { productId, wishCount: data.wishCount },
          }),
        );
      }
    } catch {
      setWished(!next); // revert
    } finally {
      setBusy(false);
    }
  }, [busy, sessionState, wished, productId]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={wished}
      aria-label={wished ? 'เอาออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
      title={wished ? 'เอาออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
      className={cn(
        'clay-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all duration-interactive ease-spring hover:scale-110 active:scale-90',
        wished ? 'text-coral-500' : 'text-fg-muted hover:text-coral-400',
        className,
      )}
    >
      <Heart
        size={17}
        strokeWidth={2.2}
        className={cn('transition-transform duration-interactive', wished && 'scale-110')}
        fill={wished ? 'currentColor' : 'none'}
      />
    </button>
  );
}
