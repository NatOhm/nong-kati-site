/**
 * Day and month boundaries are Bangkok days (2026-11-02).
 *
 * The dashboard's "วันนี้" tile and the customer-sales / wallet reports built
 * their cutoffs with `new Date()` + `setHours(0, 0, 0, 0)` — local midnight of
 * whatever machine the process runs on. Nothing in the deployment pins TZ, and
 * a Linux default is UTC, seven hours behind Bangkok: every order paid between
 * 00:00 and 07:00 Thai time was counted on the previous day, so the tile was
 * short and yesterday's was long for the first seven hours of every Thai day.
 *
 * Thailand has been UTC+7 year-round since 1941 (no DST), so a fixed offset is
 * exact rather than an approximation — and the boundary then follows the shop
 * no matter what timezone the host happens to run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bangkokDayStart, bangkokMonthStart } from '@/lib/bangkokTime';

const iso = (d: Date): string => d.toISOString();

afterEach(() => {
  vi.useRealTimers();
});

describe('bangkokDayStart', () => {
  it('keeps 03:00 Thai time on the same calendar day', () => {
    // 2026-11-01T20:30Z = 2026-11-02 03:30 in Bangkok. A UTC-midnight cutoff
    // puts this order on 1 Nov — the bug this fixes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T20:30:00Z'));

    expect(iso(bangkokDayStart())).toBe('2026-11-01T17:00:00.000Z');
    expect(iso(bangkokDayStart(0))).toBe('2026-11-01T17:00:00.000Z');
  });

  it('walks back whole Thai days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T20:30:00Z'));

    // "last 7 days" window: six days before today, still at Bangkok midnight.
    expect(iso(bangkokDayStart(6))).toBe('2026-10-26T17:00:00.000Z');
    expect(iso(bangkokDayStart(1))).toBe('2026-10-31T17:00:00.000Z');
  });

  it('is stable just before Bangkok midnight', () => {
    // 2026-11-01T16:59Z = 23:59 Thai on 1 Nov — still 1 Nov locally.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T16:59:00Z'));

    expect(iso(bangkokDayStart())).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('bangkokMonthStart', () => {
  it('starts November when Thailand has, even though UTC is still October', () => {
    // 2026-10-31T19:00Z = 2026-11-01 02:00 in Bangkok.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z'));

    expect(iso(bangkokMonthStart())).toBe('2026-10-31T17:00:00.000Z');
  });

  it('starts the month at Bangkok midnight on the 1st', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T04:00:00Z')); // 11:00 Thai, 15 Nov

    expect(iso(bangkokMonthStart())).toBe('2026-10-31T17:00:00.000Z');
  });
});
