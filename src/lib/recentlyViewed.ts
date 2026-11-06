/**
 * Recently viewed products for the mobile search sheet ("ดูล่าสุด").
 *
 * localStorage is the only store this needs: it is per-device, it survives a
 * reload, and losing it costs the visitor nothing (no account, no server call,
 * no PDPA surface).
 */

export interface RecentProduct {
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
}

const KEY = 'nk-recent-products';
const LIMIT = 8;

/** Pure: `item` first, its older copy dropped, list capped. */
export function withRecent(list: RecentProduct[], item: RecentProduct): RecentProduct[] {
  return [item, ...list.filter((p) => p.slug !== item.slug)].slice(0, LIMIT);
}

export function readRecentProducts(): RecentProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isRecentProduct) : [];
  } catch {
    // Corrupt JSON (older build, hand-edited storage) — start clean.
    return [];
  }
}

export function rememberProduct(item: RecentProduct): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(withRecent(readRecentProducts(), item)));
  } catch {
    // Private mode / quota — recents are a convenience, never a requirement.
  }
}

function isRecentProduct(v: unknown): v is RecentProduct {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p['slug'] === 'string' &&
    typeof p['name'] === 'string' &&
    (typeof p['imageUrl'] === 'string' || p['imageUrl'] === null) &&
    typeof p['price'] === 'number'
  );
}
