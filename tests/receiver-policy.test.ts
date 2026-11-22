/**
 * receiverPolicy — the single owner of "which account do we accept?".
 * Pure functions: no network, no DB, no mocks.
 */
import { describe, expect, it } from 'vitest';

import {
  checkReceiverMatch,
  normalizeAccountDigits,
  storeReceiverDigits,
} from '@/lib/payment/receiverPolicy';

describe('normalizeAccountDigits', () => {
  it('strips spaces, dashes and mask characters', () => {
    expect(normalizeAccountDigits('123-456 5786')).toBe('1234565786');
    expect(normalizeAccountDigits('xxx-x-x5786-x')).toBe('5786');
    expect(normalizeAccountDigits(null)).toBe('');
    expect(normalizeAccountDigits(undefined)).toBe('');
  });
});

describe('storeReceiverDigits', () => {
  it('resolves the manual-transfer setting to digits, empty when unconfigured', () => {
    expect(storeReceiverDigits('199-1-73578-6')).toBe('1991735786');
    expect(storeReceiverDigits(null)).toBe('');
    expect(storeReceiverDigits('  -  ')).toBe('');
  });
});

describe('checkReceiverMatch', () => {
  it('accepts a trailing-4 match even when the store side is dashed', () => {
    expect(checkReceiverMatch('123-456-5786', 'xxx-x-x5786-x')).toEqual({ ok: true });
    expect(checkReceiverMatch('199-1-73578-6', '5786')).toEqual({ ok: true });
  });

  it('accepts the masked middle window of the real store account (live 2026-10-30)', () => {
    // Genuine slip to 199-1-73578-6 reports xxx-x-x3578-x (digits 3578 =
    // positions 6-9, tail masked). Trailing-4 equality false-rejected it
    // (probe order NK-2026-000175); containment accepts it.
    expect(checkReceiverMatch('199-1-73578-6', 'xxx-x-x3578-x')).toEqual({ ok: true });
  });

  it('accepts a Bangkok Bank slip whose mask keeps the front and the tail (2026-11-22)', () => {
    // The client's real slip: 735 THB paid to 199-1-73578-6, printed as
    // 199-1-xxx786. Digits 1991786 are not contiguous inside 1991735786, so
    // containment false-rejected it — the "เทสกรุงเทพไม่ได้" report.
    expect(checkReceiverMatch('199-1-73578-6', '199-1-xxx786')).toEqual({ ok: true });
  });

  it('still rejects the sender account and other shops behind that same mask', () => {
    // Sender's own account on the same slip.
    expect(checkReceiverMatch('199-1-73578-6', '540-7-xxx640').ok).toBe(false);
    // Same prefix, different tail — and a different prefix with the right tail.
    expect(checkReceiverMatch('199-1-73578-6', '199-1-xxx999').ok).toBe(false);
    expect(checkReceiverMatch('199-1-73578-6', '541-7-xxx786').ok).toBe(false);
  });

  it('fails closed on a definite mismatch, reporting last-4 only', () => {
    const v = checkReceiverMatch('123-456-5786', 'xxx-x-x9999-x');
    expect(v).toEqual({ ok: false, detail: 'receiver …9999 vs store …5786' });
    // Never leak a full account number into a log line.
    expect(v.ok === false && /1234565786/.test(v.detail)).toBe(false);
  });

  it('trusts the provider when either side has fewer than 4 digits', () => {
    expect(checkReceiverMatch('1234565786', 'xx')).toEqual({ ok: true });
    expect(checkReceiverMatch('', 'xxx-x-x9999-x')).toEqual({ ok: true });
    expect(checkReceiverMatch(null, null)).toEqual({ ok: true });
  });
});
