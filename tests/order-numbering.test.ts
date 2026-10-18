import { describe, expect, it } from 'vitest';

import { generateOrderNumber, nextOrderSequence } from '@/lib/pricing';

/**
 * Order-number allocation gate (2026-10-16) — the "checkout 500" regression.
 *
 * Production broke with `25P02 current transaction is aborted` on every
 * `POST /api/v1/orders`: numbering was `count + 1`, order rows had been
 * deleted, so count lagged the real maximum, the insert hit the unique index,
 * Postgres aborted the transaction, and the old in-transaction retry then ran
 * inside that aborted transaction (25P02 every time) → every customer got a
 * 500 and nobody could place an order.
 *
 * The fix numbers from the HIGHEST well-formed current-year number instead.
 * These tests lock that contract on the pure allocator; the transaction
 * semantics are covered by `tests/pricing-persistence.test.ts` (Blocker 6:
 * no error may be swallowed inside the transaction body).
 */

const YEAR = 2026;
const n = (seq: number): string => `NK-${YEAR}-${String(seq).padStart(6, '0')}`;

describe('nextOrderSequence — gap-tolerant order numbering', () => {
  it('numbers from the maximum, not the count, after a row is deleted', () => {
    // Live shape when it broke: 77 rows spanning 000002..000079 with gaps.
    const rows: string[] = [];
    for (let i = 2; i <= 79; i++) if (i !== 41 && i !== 57) rows.push(n(i));
    const count = rows.length; // 76 — the old `count + 1` = 77, which is FREE
    // here, but with the real gap (41, 57) count-based numbering hands out a
    // used number as soon as the arithmetic lines up with an existing row.
    expect(nextOrderSequence(rows, count, YEAR)).toBe(80);
    expect(nextOrderSequence(rows, count, YEAR)).toBeGreaterThan(count + 1);
  });

  it('never returns a number that already exists', () => {
    const rows = [n(1), n(2), n(3), n(4), n(5)];
    const seq = nextOrderSequence(rows, rows.length, YEAR);
    expect(rows).not.toContain(generateOrderNumber(seq));
  });

  it('ignores malformed numbers (a stray timestamp suffix must not set the max)', () => {
    // Production has exactly this row: NK-2026-1790058401895.
    const rows = [n(79), n(78), 'NK-2026-1790058401895', 'garbage'];
    expect(nextOrderSequence(rows, 77, YEAR)).toBe(80);
  });

  it('ignores other years — the year prefix selects the sequence space', () => {
    expect(nextOrderSequence(['NK-2025-000999', n(3)], 4, YEAR)).toBe(4);
    expect(nextOrderSequence(['NK-2025-000999'], 1, YEAR)).toBe(2);
  });

  it('falls back to count + 1 when the sample holds no usable number', () => {
    expect(nextOrderSequence([], 12, YEAR)).toBe(13);
    expect(nextOrderSequence(['legacy-format', 'NK-2025-000001'], 0, YEAR)).toBe(1);
  });

  it('generateOrderNumber keeps the NK-YYYY-NNNNNN contract the parser relies on', () => {
    expect(generateOrderNumber(1)).toMatch(/^NK-\d{4}-000001$/);
    expect(generateOrderNumber(1790058401895)).toBe(
      `NK-${new Date().getFullYear()}-1790058401895`,
    );
  });
});
