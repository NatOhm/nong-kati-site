/**
 * Share-preview copy — weblink (OG) card + homepage link preview.
 *
 * The card art in src/app/opengraph-image.tsx and the og:title/og:description
 * on the homepage used to be hardcoded strings. Admin can now edit all of it
 * from /management/og-share; this module is the single transform for both the
 * server (admin API + getOgShareSettings in lib/data.ts) and the client editor,
 * same pattern as lib/trustBadges.ts.
 *
 * Pure (no prisma) so the parser stays unit-testable.
 */

/** Card headline — two lines, capped so they still fit the clay panel. */
export const OG_SHARE_HEADING_MAX = 30;
/** Brand chips line ("Netflix · Spotify · …"). */
export const OG_SHARE_CHANNEL_MAX = 48;
/** Trust pill text — pill width is fixed on the card. */
export const OG_SHARE_PILL_MAX = 30;
/** og:title / og:description — meta tag limits (Google truncates beyond these). */
export const OG_SHARE_META_TITLE_MAX = 70;
export const OG_SHARE_META_DESC_MAX = 160;

/**
 * Product short description — feeds og:description on product link previews
 * (and the "ซื้อ {name} ออนไลน์" fallback disappears once it's filled in).
 * Same transform lives in the admin products API on create/update.
 */
export const PRODUCT_SHORT_DESCRIPTION_MAX = 160;

export interface OgShareSettings {
  /** Card headline, line 1. */
  headingLine1: string;
  /** Card headline, line 2. */
  headingLine2: string;
  /** Brand chips line. */
  channels: string;
  /** First trust pill (orange). */
  pill1: string;
  /** Second trust pill (brown). */
  pill2: string;
  /** og:title for the homepage link preview. */
  ogTitle: string;
  /** og:description for the homepage link preview. */
  ogDescription: string;
}

/**
 * The copy that shipped hardcoded — the fallback whenever a field is absent
 * or blank, so the storefront always keeps the copy it started with.
 */
export const DEFAULT_OG_SHARE: OgShareSettings = {
  headingLine1: 'แอคดูหนัง ซีรีส์',
  headingLine2: 'ส่งถึงอีเมลทันที',
  channels: 'Netflix · Spotify · YouTube · HBO Max',
  pill1: 'โอนเงิน · ตรวจสลิป',
  pill2: 'ส่งโค้ดทันที',
  ogTitle: 'Nong-Kati — แอคดูหนัง ซีรีส์ ส่งถึงอีเมลทันที',
  ogDescription: 'ราคาดี โอนเงินพร้อมส่งสลิปยืนยัน ทีมงานยืนยันแล้วส่งโค้ดถึงอีเมล',
};

const LIMITS: Record<keyof OgShareSettings, number> = {
  headingLine1: OG_SHARE_HEADING_MAX,
  headingLine2: OG_SHARE_HEADING_MAX,
  channels: OG_SHARE_CHANNEL_MAX,
  pill1: OG_SHARE_PILL_MAX,
  pill2: OG_SHARE_PILL_MAX,
  ogTitle: OG_SHARE_META_TITLE_MAX,
  ogDescription: OG_SHARE_META_DESC_MAX,
};

const KEYS = Object.keys(DEFAULT_OG_SHARE) as (keyof OgShareSettings)[];

/** Control chars + collapsed whitespace — meta tags and satori only see clean text. */
function sanitize(raw: string, max: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Stored row JSON → effective settings. Missing/garbage JSON = full defaults;
 * a blank or non-string field falls back to the shipped copy so a cleared
 * field can never render an empty card.
 */
export function parseOgShare(value: string | null | undefined): OgShareSettings {
  let parsed: unknown = null;
  if (value) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  const src = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const out: OgShareSettings = { ...DEFAULT_OG_SHARE };
  for (const key of KEYS) {
    const raw = src[key];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const clean = sanitize(raw, LIMITS[key]);
    if (clean !== '') out[key] = clean;
  }
  return out;
}

/**
 * Untrusted PUT body → effective settings. Unknown keys ignored; the same
 * sanitize + blank-fallback rules as parseOgShare, so what GET returns after
 * a save is exactly what the card will render.
 */
export function normalizeOgShareBody(b: Record<string, unknown>): OgShareSettings {
  return parseOgShare(JSON.stringify(b));
}

/** Product short description: strip control chars, collapse spaces, cap length. */
export function normalizeProductShortDescription(raw: string): string {
  return sanitize(raw, PRODUCT_SHORT_DESCRIPTION_MAX);
}
