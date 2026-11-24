/**
 * receiverPolicy — the single owner of "which account do we accept?".
 * Pure functions: no network, no DB, no mocks.
 */
import { describe, expect, it } from 'vitest';

import {
  checkReceiverMatch,
  normalizeAccountDigits,
  normalizePersonName,
  receiverIsProven,
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

  it('treats a too-short account as unconfigured — it can never be compared', () => {
    // Audit 2026-11-24: checkReceiverMatch passes anything when the store side
    // has fewer than 4 digits, so a typo like '12' used to switch the only
    // authoritative receiver check off while still looking configured — every
    // slip paid to any account would auto-confirm. Unconfigured fails closed.
    expect(storeReceiverDigits('12')).toBe('');
    expect(storeReceiverDigits('1-2-3')).toBe('');
    // Four digits is the shortest value the compare can actually test.
    expect(storeReceiverDigits('5786')).toBe('5786');
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

  it('accepts the Bangkok Bank mask (front and tail visible, middle hidden)', () => {
    // A real BBL receipt to 199-1-73578-6 prints 199-1-xxx786 (attached
    // 2026-11-24, ฿67.00): its digits (1991786) are not one contiguous run,
    // so containment alone can never match it.
    expect(checkReceiverMatch('199-1-73578-6', '199-1-xxx786')).toEqual({ ok: true });
  });

  it('rejects a masked account whose visible digits sit in the wrong slots', () => {
    // The mask is the ruler: one mask char hides one digit, so a visible digit
    // in the wrong slot is a different account even when the same run appears.
    expect(checkReceiverMatch('199-1-73578-6', '1xx-9-73578-x').ok).toBe(false);
    // A mask one digit longer than the store account is another account.
    expect(checkReceiverMatch('199-1-73578-6', '199-1-xxx786-0').ok).toBe(false);
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

describe('receiverIsProven — a compatible mask is not proof of identity', () => {
  const store = { storeAccountNumber: '199-1-73578-6', storeAccountName: 'กนกนาถ โรจนวุฒิ' };

  it('proves the shop account through the holder name on both real mask shapes', () => {
    // Tail mask (live NK-2026-000183) and Bangkok Bank middle mask (the ฿67
    // receipt): the digits differ in shape, the holder does not.
    for (const account of ['xxx-x-x3578-x', '199-1-xxx786']) {
      expect(
        receiverIsProven({ ...store, slipReceiverAccount: account, slipReceiverName: 'กนกนาถ โรจนวุฒิ' }),
      ).toEqual({ proven: true, by: 'holder-name' });
    }
  });

  it('treats titles, spacing, case and zero-width characters as presentation', () => {
    for (const name of [
      'นางสาวกนกนาถ โรจนวุฒิ',
      'นาย กนกนาถ   โรจนวุฒิ',
      'นางสาว กนกนาถ\u200Bโรจนวุฒิ',
      'MRS. กนกนาถ โรจนวุฒิ',
    ]) {
      expect(
        receiverIsProven({ ...store, slipReceiverAccount: 'xxx-x-x3578-x', slipReceiverName: name }),
      ).toEqual({ proven: true, by: 'holder-name' });
    }
    expect(normalizePersonName('  นาย  สมชาย ')).toBe('สมชาย');
  });

  it('refuses a different holder whose mask fits the same window — the cross-bank hole', () => {
    // `xxx-x-x3578-x` fits EVERY account with 3578 in slots 6–9. Before this
    // rule, that was enough to auto-confirm an order whose money went to
    // someone else.
    const verdict = receiverIsProven({
      ...store,
      slipReceiverAccount: 'xxx-x-x3578-x',
      slipReceiverName: 'สมชาย ใจดี',
    });
    expect(verdict).toMatchObject({ proven: false, reason: 'holder-name-differs' });
    expect('detail' in verdict && verdict.detail).toBe(
      'receiving account holder is not the shop account holder',
    );
  });

  it('fails closed when the shop has no holder name to compare', () => {
    expect(
      receiverIsProven({
        ...store,
        storeAccountName: null,
        slipReceiverAccount: 'xxx-x-x3578-x',
        slipReceiverName: 'กนกนาถ โรจนวุฒิ',
      }),
    ).toMatchObject({ proven: false, reason: 'store-name-unset' });
    // A name of only punctuation/masks is not a name either.
    expect(
      receiverIsProven({
        ...store,
        storeAccountName: '  -  ',
        slipReceiverAccount: 'xxx-x-x3578-x',
        slipReceiverName: 'กนกนาถ โรจนวุฒิ',
      }),
    ).toMatchObject({ proven: false, reason: 'store-name-unset' });
  });

  it('fails closed when the provider names no holder', () => {
    expect(
      receiverIsProven({ ...store, slipReceiverAccount: 'xxx-x-x3578-x', slipReceiverName: null }),
    ).toMatchObject({ proven: false, reason: 'provider-named-no-holder' });
  });

  it('accepts a fully printed account without needing any name', () => {
    expect(
      receiverIsProven({
        ...store,
        storeAccountName: null,
        slipReceiverAccount: '199-1-73578-6',
        slipReceiverName: null,
      }),
    ).toEqual({ proven: true, by: 'full-account' });
    // A printed account that is not ours is never proof, name or not.
    expect(
      receiverIsProven({
        ...store,
        storeAccountName: 'กนกนาถ โรจนวุฒิ',
        slipReceiverAccount: '199-1-73578-9',
        slipReceiverName: 'กนกนาถ โรจนวุฒิ',
      }),
    ).toMatchObject({ proven: true, by: 'holder-name' });
  });

  it('never proves anything without a configured store account', () => {
    expect(
      receiverIsProven({
        storeAccountNumber: null,
        storeAccountName: 'กนกนาถ โรจนวุฒิ',
        slipReceiverAccount: '199-1-73578-6',
        slipReceiverName: 'กนกนาถ โรจนวุฒิ',
      }),
    ).toMatchObject({ proven: false, reason: 'store-account-unset' });
  });
});
