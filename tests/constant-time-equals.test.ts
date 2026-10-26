/**
 * Shared constant-time comparison — audit finding 5 (2026-10-26).
 *
 * The same hand-rolled timing-safe compare existed in four diverging copies
 * (orders/expire, promotions/expire, email-outbox/drain, jwt.ts); all four
 * now call constantTimeEquals. Semantics must match the originals: length
 * mismatch short-circuits to false, content compared without early exit.
 */
import { describe, expect, it } from 'vitest';

import { constantTimeEquals } from '@/lib/crypto';

describe('constantTimeEquals', () => {
  it('matches identical strings, including empty', () => {
    expect(constantTimeEquals('cron-secret-value', 'cron-secret-value')).toBe(true);
    expect(constantTimeEquals('', '')).toBe(true);
  });

  it('rejects same-length content differences', () => {
    expect(constantTimeEquals('secret-a', 'secret-b')).toBe(false);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
  });

  it('rejects length mismatches (length is checked first)', () => {
    expect(constantTimeEquals('short', 'much-longer-value')).toBe(false);
    expect(constantTimeEquals('', 'x')).toBe(false);
    // Multi-byte: different UTF-16 length, same UTF-8 byte length (2) —
    // falls through to the content compare instead of the length check.
    expect(constantTimeEquals('é', 'ab')).toBe(false);
    // …and the reverse: different byte length, content never compared.
    expect(constantTimeEquals('é', 'a')).toBe(false);
  });

  it('agrees with === on non-ASCII content (UTF-8 semantics)', () => {
    expect(constantTimeEquals('สวัสดี', 'สวัสดี')).toBe(true);
    expect(constantTimeEquals('สวัสดี', 'สวัสดีครับ')).toBe(false);
    expect(constantTimeEquals('เก้า', 'แปด')).toBe(false);
  });
});
