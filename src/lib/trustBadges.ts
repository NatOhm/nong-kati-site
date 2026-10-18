/**
 * Homepage trust-badge section ("ทำไมต้อง Nong-Kati?") settings — stored under
 * SiteSetting key 'trustBadges'. Mirrors src/lib/faqSettings.ts: one parse
 * function for stored rows, one normalize function for PUT bodies, shared by
 * the server (GET/PUT route, getTrustBadgesSettings) and the client editor
 * (/management/trust-badges) so validation can never drift between them.
 *
 * Icons are stored as KEYS, never markup or component names — the client
 * maps a key to a lucide icon + its chip colours (see components/home/
 * TrustBadges). An unknown key falls back instead of dropping the badge:
 * a stale icon must never make copy disappear from the storefront.
 */

/** Allowed icon keys, in the order the admin picker shows them. */
export const TRUST_BADGE_ICON_KEYS = [
  'shield',
  'zap',
  'headphones',
  'wallet',
  'truck',
  'lock',
  'clock',
  'gift',
] as const;

export type TrustBadgeIconKey = (typeof TRUST_BADGE_ICON_KEYS)[number];

/** Used whenever a stored/sent icon key is unknown (presentation-only field). */
export const TRUST_BADGE_FALLBACK_ICON: TrustBadgeIconKey = 'shield';

/**
 * Grid is 2-up on mobile / 5-up on desktop — more than 8 badges wraps into a
 * lonely orphan row and dilutes the section, so saves are capped here.
 */
export const MAX_TRUST_BADGES = 8;

/** Title/desc caps (Thai copy is short; caps stop runaway paste-ins). */
export const TRUST_BADGE_TITLE_MAX = 60;
export const TRUST_BADGE_DESC_MAX = 140;

/** One badge as stored under SiteSetting key 'trustBadges'. */
export interface TrustBadgeItem {
  icon: TrustBadgeIconKey;
  title: string;
  desc: string;
  order: number;
}

/** Expected shape stored under SiteSetting key 'trustBadges'. */
export interface TrustBadgesSettings {
  /** Storefront visibility of the whole section. Defaults to true so a row
   * written before this flag existed keeps showing its badges. */
  enabled: boolean;
  /** Section heading. */
  title: string;
  items: TrustBadgeItem[];
}

/**
 * The built-in section — the exact copy that shipped hardcoded before the
 * settings existed. Returned when no row is saved (or the row is corrupt),
 * so the storefront looks identical until an admin saves an edit.
 *
 * Audit 2026-09-28 note (kept from the old component): the zap badge used to
 * promise codes "within 60 seconds" — the production path is transfer → slip
 * upload → human verification, so the promise was fabricated. The copy now
 * describes what actually happens; keep it honest when editing defaults.
 */
export const DEFAULT_TRUST_BADGES: TrustBadgesSettings = {
  enabled: true,
  title: 'ทำไมต้อง Nong-Kati?',
  items: [
    { icon: 'shield', title: 'รับประกัน 7 วัน', desc: 'เปลี่ยนใหม่ทันทีหากมีปัญหา', order: 0 },
    { icon: 'zap', title: 'ได้โค้ดหลังยืนยัน', desc: 'ทีมงานตรวจสลิปแล้วส่งโค้ดทันที', order: 1 },
    { icon: 'headphones', title: 'ตอบไว 24 ชม.', desc: 'ทีมงานพร้อมดูแลทุกวัน', order: 2 },
    { icon: 'wallet', title: 'PromptPay + โอนเงิน', desc: 'ชำระเงินได้หลายช่องทาง', order: 3 },
  ],
};

function iconKey(value: unknown): TrustBadgeIconKey {
  return typeof value === 'string' &&
    (TRUST_BADGE_ICON_KEYS as readonly string[]).includes(value)
    ? (value as TrustBadgeIconKey)
    : TRUST_BADGE_FALLBACK_ICON;
}

function badgeRow(raw: unknown, index: number): TrustBadgeItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r['title'] === 'string' ? r['title'].trim().slice(0, TRUST_BADGE_TITLE_MAX) : '';
  if (!title) return null;
  const desc =
    typeof r['desc'] === 'string' ? r['desc'].trim().slice(0, TRUST_BADGE_DESC_MAX) : '';
  const order = typeof r['order'] === 'number' && Number.isFinite(r['order']) ? r['order'] : index;
  return { icon: iconKey(r['icon']), title, desc, order };
}

/**
 * Parse the stored 'trustBadges' value. Unusable JSON / a missing items array
 * returns the built-in defaults rather than an empty section — an empty FAQ
 * is a legitimate state, but silently deleting the storefront's trust badges
 * because a row got corrupt would be a regression the admin never asked for.
 */
export function parseTrustBadges(value: string): TrustBadgesSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return structuredClone(DEFAULT_TRUST_BADGES);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !('items' in parsed) ||
    !Array.isArray((parsed as { items: unknown }).items)
  ) {
    return structuredClone(DEFAULT_TRUST_BADGES);
  }

  const raw = (parsed as { items: unknown[] }).items;
  const enabled =
    'enabled' in parsed && typeof (parsed as { enabled: unknown }).enabled === 'boolean'
      ? (parsed as { enabled: boolean }).enabled
      : true;
  const title =
    'title' in parsed && typeof (parsed as { title: unknown }).title === 'string'
      ? (parsed as { title: string }).title.trim().slice(0, TRUST_BADGE_TITLE_MAX)
      : '';
  const items: TrustBadgeItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = badgeRow(raw[i], i);
    if (row) items.push(row);
  }
  items.sort((a, b) => a.order - b.order);
  return {
    enabled,
    title: title || DEFAULT_TRUST_BADGES.title,
    items: items.slice(0, MAX_TRUST_BADGES),
  };
}

/** Build the normalized TrustBadgesSettings the API accepts/returns from a PUT body. */
export function normalizeTrustBadgesBody(
  body: Record<string, unknown>,
  current: TrustBadgesSettings,
): TrustBadgesSettings {
  // Visibility and heading are independent of the item list: toggling the
  // section off (or renaming it) with no usable badges in the payload is a
  // legitimate edit and must survive (the old FAQ-style `return current`
  // would silently drop it).
  const enabled = typeof body['enabled'] === 'boolean' ? body['enabled'] : current.enabled;
  const title =
    typeof body['title'] === 'string' && body['title'].trim()
      ? body['title'].trim().slice(0, TRUST_BADGE_TITLE_MAX)
      : current.title;

  const incoming = Array.isArray(body['items']) ? body['items'] : null;
  const items: TrustBadgeItem[] = [];
  if (incoming) {
    for (let i = 0; i < incoming.length; i += 1) {
      const row = badgeRow(incoming[i], i);
      if (row) items.push(row);
    }
  }
  if (items.length === 0) {
    // No usable items in the payload → keep the stored badges, still apply
    // the visibility flag and heading.
    return { enabled, title, items: current.items };
  }
  items.sort((a, b) => a.order - b.order);
  return { enabled, title, items: items.slice(0, MAX_TRUST_BADGES) };
}
