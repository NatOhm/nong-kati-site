import { describe, expect, it } from 'vitest';

import { normalizeFaqBody, parseFaqSettings, type FaqSettings } from '@/lib/faqSettings';

const stored = (items: unknown[], enabled?: boolean): string =>
  JSON.stringify(enabled === undefined ? { items } : { items, enabled });

const item = (question: string, answer: string, order = 0) => ({ question, answer, order });

describe('FAQ settings visibility flag', () => {
  it('defaults to visible when the stored row predates the flag', () => {
    const parsed = parseFaqSettings(stored([item('สินค้าใช้งานได้จริงไหม?', '<p>ใช่ครับ</p>')]));
    expect(parsed.enabled).toBe(true);
    expect(parsed.items).toHaveLength(1);
  });

  it('reads an explicit false and keeps the questions', () => {
    const parsed = parseFaqSettings(
      stored([item('จัดส่งกี่วัน?', '<p>1-3 วันทำการ</p>')], false),
    );
    expect(parsed.enabled).toBe(false);
    expect(parsed.items[0]?.question).toBe('จัดส่งกี่วัน?');
  });

  it('falls back to visible for unusable JSON', () => {
    expect(parseFaqSettings('not-json')).toEqual({ enabled: true, items: [] });
    expect(parseFaqSettings('[]')).toEqual({ enabled: true, items: [] });
  });

  it('applies a toggle even when the payload carries no usable items', () => {
    const current: FaqSettings = {
      enabled: true,
      items: [item('รับประกันอย่างไร?', '<p>7 วัน</p>')],
    };

    // Switching the section off with an empty list must not wipe the rows —
    // this is the exact case the old `return current` got wrong.
    const off = normalizeFaqBody({ enabled: false, items: [] }, current);
    expect(off.enabled).toBe(false);
    expect(off.items).toEqual(current.items);

    // …and a payload without the flag leaves visibility untouched.
    const untouched = normalizeFaqBody({ items: [] }, { ...current, enabled: false });
    expect(untouched.enabled).toBe(false);
  });

  it('round-trips enabled through save → parse', () => {
    const next = normalizeFaqBody(
      { enabled: false, items: [item('ใหม่?', '<p>คำตอบ</p>', 0)] },
      { enabled: true, items: [] },
    );
    expect(next.enabled).toBe(false);
    expect(parseFaqSettings(JSON.stringify(next)).enabled).toBe(false);
  });
});
