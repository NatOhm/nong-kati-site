/**
 * The stock ledger's one non-obvious rule: a clamp's effect on Σ(delta) is its
 * OVERSHOOT, not the number of clamps.
 *
 * `ProductVariant.stock` is what the shop sells from and `StockMove` is the
 * audit trail. Voids record `delta: -n` but write `stockAfter = max(stock − n, 0)`,
 * so a bulk void of 5 against 2 in stock takes 5 off the ledger and only 2 off
 * the counter — one clamp accounting for 3. Comparing the Σ(delta) gap to the
 * clamp COUNT made `scripts/stock-reconcile.mjs` report `RESULT: DRIFT` on a
 * ledger that was exactly right (reproduced 2026-11-16, fixed 2026-11-17). The
 * first two cases below are that bug and its control; the rest keep the drift
 * side honest, so the fix cannot have been "stop reporting drift".
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Plain ESM script, shipped without type declarations: it runs under bare
// `node` against production, so it cannot import from src/.
// @ts-expect-error -- untyped .mjs helper
import { reconcile } from '../scripts/stock-reconcile.mjs';

type Ledger = {
  variants: Array<{ id: string; label?: string; stock: number }>;
  moves: Array<{
    id: string;
    variantId: string;
    delta: number;
    stockAfter: number;
    reason: string;
    createdAt: string;
  }>;
};

const move = (
  id: string,
  delta: number,
  stockAfter: number,
  reason = 'test',
  day = '01',
): Ledger['moves'][number] => ({
  id,
  variantId: 'v',
  delta,
  stockAfter,
  reason,
  createdAt: `2026-11-${day}T00:00:00.000Z`,
});

const one = (stock: number, moves: Ledger['moves']): Ledger => ({
  variants: [{ id: 'v', label: 'x', stock }],
  moves,
});

const SCRIPT = path.join(process.cwd(), 'scripts', 'stock-reconcile.mjs');

/** The CLI, in an environment that can never reach a database. */
const runCli = (args: string[]) => {
  const env = { ...process.env };
  delete env['DATABASE_URL'];
  delete env['PLESK_SSH_HOST'];
  delete env['PLESK_SSH_KEY'];
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
};

describe('stock-reconcile — clamp accounting', () => {
  it('a bulk void does not report DRIFT: one clamp can account for more than one unit', () => {
    // 0 + 2 = 2 (recorded 2), then 2 − 5 = −3 applied as 0 → one clamp, overshoot 3.
    const r = reconcile(one(0, [move('m1', 2, 2, 'restock'), move('m2', -5, 0, 'bulk-void', '02')]));

    expect(r.consistent).toBe(true);
    expect(r.totals.clamps).toBe(1);
    expect(r.totals.clampOvershoot).toBe(3);
    expect(r.rows[0]?.shortfall).toBe(-3);
    expect(r.totals.unexplainedShortfall).toBe(0);
    expect(r.totals.chainBreaks).toBe(0);
    expect(r.totals.tailMismatch).toBe(0);
    // The old bug, stated as an assertion: the gap (−3) is not the clamp count (−1).
    expect(r.rows[0]?.shortfall).not.toBe(-r.totals.clamps);
  });

  it('single-unit void control: overshoot and gap are both 1', () => {
    const r = reconcile(one(0, [move('m1', -1, 0, 'void')]));

    expect(r.consistent).toBe(true);
    expect(r.totals.clamps).toBe(1);
    expect(r.totals.clampOvershoot).toBe(1);
    expect(r.rows[0]?.shortfall).toBe(-1);
    expect(r.totals.unexplainedShortfall).toBe(0);
  });

  it('clean ledger needs no clamp accounting at all', () => {
    const r = reconcile(one(1, [move('m1', 1, 1, 'restock')]));

    expect(r.consistent).toBe(true);
    expect(r.totals.clamps).toBe(0);
    expect(r.totals.clampOvershoot).toBe(0);
    expect(r.rows[0]?.shortfall).toBe(0);
    expect(r.totals.unexplainedShortfall).toBe(0);
  });

  it('still reports DRIFT when stockAfter disagrees with the chain', () => {
    // 0 + 2 = 2 ✓, then 2 + 3 = 5 but 99 was recorded: a real break, not a clamp.
    const r = reconcile(one(9, [move('m1', 2, 2, 'restock'), move('m2', 3, 99, 'restock', '02')]));

    expect(r.consistent).toBe(false);
    expect(r.totals.chainBreaks).toBe(1);
    expect(r.totals.tailMismatch).toBe(1);
    expect(r.totals.unexplainedShortfall).toBe(1);
    expect(r.breaks[0]?.expected).toBe(5);
    expect(r.breaks[0]?.recorded).toBe(99);
  });

  it('still reports DRIFT when the counter disagrees with the tail but the chain is intact', () => {
    const r = reconcile(one(5, [move('m1', 2, 2, 'restock')]));

    expect(r.consistent).toBe(false);
    expect(r.totals.chainBreaks).toBe(0);
    expect(r.totals.tailMismatch).toBe(1);
    expect(r.totals.unexplainedShortfall).toBe(1);
    expect(r.rows[0]?.shortfall).toBe(-3);
  });
});

describe('stock-reconcile — CLI contract', () => {
  it('the help lists --url, because a one-off read should not need an env prefix', () => {
    const r = runCli(['--help']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--url=<mysql://');
    expect(r.stdout).toContain('default: $DATABASE_URL');
  });

  it('refuses an unknown flag instead of falling back to DATABASE_URL', () => {
    const r = runCli(['--urll=mysql://user:pass@host:3306/db']);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown flag --urll=mysql://user:pass@host:3306/db.');
  });

  it('refuses a detached --url value, so the URL is never guessed', () => {
    const r = runCli(['--url', 'mysql://user:pass@host:3306/db']);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown flag --url.');
  });

  it('says how to supply a URL when there is none', () => {
    const r = runCli([]);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--url=mysql://');
    expect(r.stderr).toContain('DATABASE_URL');
  });
});
