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
