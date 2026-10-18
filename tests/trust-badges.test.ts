/**
 * Trust-badge settings (SiteSetting key 'trustBadges') — the admin-editable
 * homepage section "ทำไมต้อง Nong-Kati?".
 *
 * The lib is the single conversion point for the whole feature: GET/PUT
 * /api/v1/admin/settings/trust-badges, getTrustBadgesSettings (storefront
 * render) and /management/trust-badges (editor) all call the same two
 * functions, so these tests cover every consumer.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRUST_BADGES,
  MAX_TRUST_BADGES,
  TRUST_BADGE_FALLBACK_ICON,
  TRUST_BADGE_ICON_KEYS,
  normalizeTrustBadgesBody,
  parseTrustBadges,
  type TrustBadgesSettings,
} from '@/lib/trustBadges';

const badge = (
  title: string,
  desc = '',
  icon: string = 'shield',
  order = 0,
): Record<string, unknown> => ({ icon, title, desc, order });

describe('trust badges — built-in defaults', () => {
  it('reproduce the copy that shipped hardcoded (visible, 4 badges, real icons)', () => {
    expect(DEFAULT_TRUST_BADGES.enabled).toBe(true);
    expect(DEFAULT_TRUST_BADGES.title).toBe('ทำไมต้อง Nong-Kati?');
    expect(DEFAULT_TRUST_BADGES.items).toHaveLength(4);
    for (const item of DEFAULT_TRUST_BADGES.items) {
      expect(TRUST_BADGE_ICON_KEYS).toContain(item.icon);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('describe the real fulfilment path, not the retired "60 seconds" promise', () => {
    // Audit 2026-09-28 removed a fabricated speed promise; the default copy
    // must keep saying "after verification" (ยืนยัน), never a time limit.
    const copy = DEFAULT_TRUST_BADGES.items.map((i) => `${i.title} ${i.desc}`).join(' ');
    expect(copy).toContain('ยืนยัน');
    expect(copy).not.toMatch(/60\s*วิ/);
  });
});

describe('trust badges — parseTrustBadges', () => {
  it('unusable JSON / non-object / missing items falls back to the defaults', () => {
    // Deviation from parseFaqSettings (which returns an empty list): an empty
    // FAQ is legitimate, but a corrupt row must not delete the storefront's
    // trust badges — the admin never asked for that.
    expect(parseTrustBadges('not-json')).toEqual(DEFAULT_TRUST_BADGES);
    expect(parseTrustBadges('[]')).toEqual(DEFAULT_TRUST_BADGES);
    expect(parseTrustBadges('{"enabled":false}')).toEqual(DEFAULT_TRUST_BADGES);
  });

  it('keeps a row written before enabled/title existed', () => {
    const parsed = parseTrustBadges(JSON.stringify({ items: [badge('ส่งเร็ว', 'ภายใน 1 วัน')] }));
    expect(parsed.enabled).toBe(true);
    expect(parsed.title).toBe(DEFAULT_TRUST_BADGES.title);
    expect(parsed.items[0]).toEqual({
      icon: TRUST_BADGE_FALLBACK_ICON,
      title: 'ส่งเร็ว',
      desc: 'ภายใน 1 วัน',
      order: 0,
    });
  });

  it('falls back to the shield icon for an unknown key instead of dropping the badge', () => {
    const parsed = parseTrustBadges(
      JSON.stringify({ items: [badge('รับประกัน', '7 วัน', 'rocket', 0)] }),
    );
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.icon).toBe(TRUST_BADGE_FALLBACK_ICON);
  });

  it('drops rows without a title, sorts by order and caps at MAX_TRUST_BADGES', () => {
    const rows = [
      badge('', 'ไม่มีหัวข้อ → ทิ้ง', 'shield', 0),
      42,
      ...Array.from({ length: MAX_TRUST_BADGES + 2 }, (_, i) =>
        badge(`ป้าย ${i + 1}`, '', 'zap', i),
      ),
    ];
    const parsed = parseTrustBadges(JSON.stringify({ items: rows }));
    expect(parsed.items).toHaveLength(MAX_TRUST_BADGES);
    expect(parsed.items[0]?.title).toBe('ป้าย 1');
    expect(parsed.items.map((i) => i.title)).toEqual(
      [...parsed.items.map((i) => i.title)].sort(),
    );
  });

  it('honours an explicit false toggle and a custom heading', () => {
    const parsed = parseTrustBadges(
      JSON.stringify({ enabled: false, title: '  จุดเด่นร้านค้า  ', items: [badge('ใหม่')] }),
    );
    expect(parsed.enabled).toBe(false);
    expect(parsed.title).toBe('จุดเด่นร้านค้า');
    expect(parsed.items).toHaveLength(1);
  });
});

describe('trust badges — normalizeTrustBadgesBody', () => {
  const current: TrustBadgesSettings = structuredClone(DEFAULT_TRUST_BADGES);

  it('applies a toggle and a heading even when the payload carries no usable items', () => {
    // Switching the section off (or renaming it) with an empty list must not
    // wipe the saved badges — the old FAQ-style `return current` got this wrong.
    const off = normalizeTrustBadgesBody({ enabled: false, title: 'x', items: [] }, current);
    expect(off.enabled).toBe(false);
    expect(off.title).toBe('x');
    expect(off.items).toEqual(current.items);

    // …and a payload without those fields leaves them untouched.
    const untouched = normalizeTrustBadgesBody({ items: [] }, { ...current, enabled: false });
    expect(untouched.enabled).toBe(false);
    expect(untouched.title).toBe(current.title);
  });

  it('trims, caps and re-orders incoming badges, dropping title-less rows', () => {
    const next = normalizeTrustBadgesBody(
      {
        enabled: true,
        title: '  ทำไมต้องเรา?  ',
        items: [
          badge('  สอง  ', '  รายละเอียด  ', 'truck', 1),
          badge('', 'ไม่มีหัวข้อ', 'zap', 0),
          badge('  หนึ่ง  ', '', 'wallet', 0),
          badge(' เกินลิมิต ', '', 'gift', 99),
          ...Array.from({ length: MAX_TRUST_BADGES }, (_, i) => badge(`เพิ่ม ${i}`, '', 'clock', 10 + i)),
        ],
      },
      current,
    );
    expect(next.title).toBe('ทำไมต้องเรา?');
    expect(next.items).toHaveLength(MAX_TRUST_BADGES);
    // order 0 ("หนึ่ง") wins, then order 1 ("สอง"); the row with no title is gone.
    expect(next.items[0]).toEqual({
      icon: 'wallet',
      title: 'หนึ่ง',
      desc: '',
      order: 0,
    });
    expect(next.items[1]?.title).toBe('สอง');
    expect(next.items[1]?.desc).toBe('รายละเอียด');
  });

  it('normalizes an unknown icon key rather than rejecting the badge', () => {
    const next = normalizeTrustBadgesBody(
      { items: [badge('โล่คือ fallback', 'desc', 'not-a-real-icon', 0)] },
      current,
    );
    expect(next.items[0]?.icon).toBe(TRUST_BADGE_FALLBACK_ICON);
  });

  it('round-trips enabled + heading through save → parse', () => {
    const next = normalizeTrustBadgesBody(
      { enabled: false, title: 'ข้อความใหม่', items: [badge('ใหม่?', 'คำตอบ', 'zap', 0)] },
      current,
    );
    const reparsed = parseTrustBadges(JSON.stringify(next));
    expect(reparsed.enabled).toBe(false);
    expect(reparsed.title).toBe('ข้อความใหม่');
    expect(reparsed.items[0]?.title).toBe('ใหม่?');
    expect(reparsed.items[0]?.icon).toBe('zap');
  });

  it('keeps every allowlisted icon key so the admin picker round-trips losslessly', () => {
    for (const icon of TRUST_BADGE_ICON_KEYS) {
      const next = normalizeTrustBadgesBody({ items: [badge(icon, '', icon, 0)] }, current);
      expect(next.items[0]?.icon, icon).toBe(icon);
    }
  });
});
