/**
 * Combobox keyboard navigation (WCAG 2.1.1) — regression coverage for the pure
 * decision function behind `useComboboxKeyboard`.
 *
 * Bug (Oct 4, 2026): both search boxes shipped the full combobox ARIA contract
 * — role=combobox, aria-expanded, aria-controls, a listbox of role=option —
 * and implemented none of the navigation that contract implies. Escape and the
 * mouse were the only inputs that did anything, so there was no keyboard path
 * to any suggestion while the ARIA actively advertised one. WCAG 2.1.1.
 *
 * `resolveComboboxKey` is pure, so these tests need no DOM — this repo runs
 * vitest with `environment: 'node'` and ships no jsdom/testing-library. The
 * DOM-level effects (aria-activedescendant actually rendering, scrollIntoView,
 * real keypresses reaching the input) are covered in e2e/smoke.spec.ts, which
 * drives a real browser against a production build.
 */
import { describe, expect, it } from 'vitest';

import { resolveComboboxKey } from '@/hooks/useComboboxKeyboard';

/** Convenience: run a sequence of keys, returning the index after each. */
function run(keys: string[], start: number, count: number): number[] {
  let idx = start;
  const seen: number[] = [];
  for (const k of keys) {
    const a = resolveComboboxKey(k, idx, count);
    if (a.kind === 'move') idx = a.nextIndex;
    seen.push(idx);
  }
  return seen;
}

describe('resolveComboboxKey — arrow navigation', () => {
  it('ArrowDown walks the list and wraps past the end', () => {
    expect(run(['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'], -1, 3)).toEqual([0, 1, 2, 0]);
  });

  it('ArrowUp walks backwards and wraps past the start', () => {
    expect(run(['ArrowUp', 'ArrowUp', 'ArrowUp'], -1, 3)).toEqual([2, 1, 0]);
  });

  it('stays in range for a single-option list', () => {
    expect(run(['ArrowDown', 'ArrowDown', 'ArrowUp'], -1, 1)).toEqual([0, 0, 0]);
  });

  it('leaves the arrows alone when the list is empty', () => {
    // Must be `ignore`, not `move`: with no suggestions the arrow keys should
    // still move the text caret inside the input.
    expect(resolveComboboxKey('ArrowDown', -1, 0)).toEqual({ kind: 'ignore' });
    expect(resolveComboboxKey('ArrowUp', -1, 0)).toEqual({ kind: 'ignore' });
  });

  it('never returns an out-of-range index', () => {
    for (const count of [1, 2, 3, 7]) {
      for (const start of [-1, 0, count - 1]) {
        for (const key of ['ArrowDown', 'ArrowUp']) {
          const a = resolveComboboxKey(key, start, count);
          if (a.kind === 'move') {
            expect(a.nextIndex).toBeGreaterThanOrEqual(0);
            expect(a.nextIndex).toBeLessThan(count);
          }
        }
      }
    }
  });
});

describe('resolveComboboxKey — Enter', () => {
  it('selects the highlighted option', () => {
    expect(resolveComboboxKey('Enter', 1, 3)).toEqual({ kind: 'select', index: 1 });
  });

  it('falls through to the normal submit when nothing is highlighted', () => {
    // This is what preserves the pre-existing "Enter searches" behaviour.
    expect(resolveComboboxKey('Enter', -1, 3)).toEqual({ kind: 'commit' });
  });

  it('falls through when the highlight is stale (list shrank under it)', () => {
    // The shrink case: index 5 remembered, list now has 2. Selecting index 5
    // would be undefined; committing is the safe, predictable outcome.
    expect(resolveComboboxKey('Enter', 5, 2)).toEqual({ kind: 'commit' });
  });

  it('still selects when the list is empty and the highlight is -1', () => {
    expect(resolveComboboxKey('Enter', -1, 0)).toEqual({ kind: 'commit' });
  });
});

describe('resolveComboboxKey — Escape and unhandled keys', () => {
  it('Escape closes the list', () => {
    expect(resolveComboboxKey('Escape', 0, 3)).toEqual({ kind: 'close' });
    expect(resolveComboboxKey('Escape', -1, 3)).toEqual({ kind: 'close' });
  });

  it('ignores keys that are not ours', () => {
    // Tab must pass through so focus can leave the field, and Home/End must
    // keep editing the text caret rather than jumping the list.
    for (const k of ['a', 'Tab', 'Home', 'End', 'PageUp', 'Shift', 'Control']) {
      expect(resolveComboboxKey(k, 0, 3), `${k} should be ignored`).toEqual({ kind: 'ignore' });
    }
  });
});