'use client';

/**
 * useComboboxKeyboard — keyboard + AT wiring for an input[role=combobox] paired
 * with a [role=listbox].
 *
 * Bug (Oct 4, 2026): both search boxes (the navbar and /search) declared the
 * full combobox contract — role=combobox, aria-expanded, aria-controls, and a
 * listbox of role=option children — but implemented none of the behaviour that
 * contract promises. Only Escape and the mouse worked. A screen reader
 * announces "combobox, 6 items" and then the user has no way to move through
 * the list: no arrow keys, no aria-activedescendant to say which option is
 * current. There was literally no keyboard path to any suggestion. That is
 * WCAG 2.1.1 (Keyboard), and it is worse than it sounds because the ARIA said
 * the navigation existed.
 *
 * Fixes:
 *  - Up/Down move the highlight, wrapping at both ends.
 *  - Enter commits the highlighted option; with nothing highlighted it falls
 *    through to the form's normal submit, so the existing "Enter searches"
 *    behaviour is preserved exactly.
 *  - aria-activedescendant points at the active option so AT can announce it
 *    without moving DOM focus away from the input (moving focus would break
 *    typing).
 *  - The active option is scrolled into view, since the list can be taller than
 *    its max-height and the highlight would otherwise walk off the panel.
 *  - Escape closes the list, matching what both boxes already did.
 *
 * Deliberately NOT handled: Home/End. In a text input those belong to the text
 * caret, and hijacking them would break normal editing inside the combobox.
 * Tab is left alone so focus still leaves the field the way a user expects.
 *
 * The decision logic is a PURE function (`resolveComboboxKey`) and the hook is
 * a thin wrapper. That split is deliberate: this repo has no DOM test
 * environment (vitest runs `environment: 'node'` with no jsdom or
 * testing-library), so a hook tested only through rendering would be
 * untestable. The pure function is exhaustively unit-tested in
 * tests/combobox-keyboard.test.ts; the DOM effects (aria-activedescendant
 * rendering, scrollIntoView) are covered by the Playwright e2e spec, which
 * drives real keypresses against a real build.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** What a keypress means for the list. */
export type ComboboxAction =
  | { kind: 'move'; nextIndex: number }
  /** Commit the highlighted option. */
  | { kind: 'select'; index: number }
  /** Nothing highlighted — let the form do its normal submit. */
  | { kind: 'commit' }
  /** Dismiss the list. */
  | { kind: 'close' }
  /** Not ours: let the event through untouched. */
  | { kind: 'ignore' };

/**
 * Pure decision function: given a key and the current highlight, what should
 * happen? Split out from the hook so the wrap-around and Enter-fallthrough
 * rules can be tested exhaustively without a DOM.
 *
 * `activeIndex` of -1 means nothing is highlighted.
 */
export function resolveComboboxKey(
  key: string,
  activeIndex: number,
  optionCount: number,
): ComboboxAction {
  switch (key) {
    case 'ArrowDown':
      // No list open: leave the caret alone so the arrow still moves the text
      // cursor, which is what a user typing expects.
      if (optionCount === 0) return { kind: 'ignore' };
      // Wraps: past the end returns to the first. From -1 it lands on 0, so the
      // first press always selects the first option.
      return { kind: 'move', nextIndex: activeIndex + 1 >= optionCount ? 0 : activeIndex + 1 };

    case 'ArrowUp':
      if (optionCount === 0) return { kind: 'ignore' };
      return { kind: 'move', nextIndex: activeIndex <= 0 ? optionCount - 1 : activeIndex - 1 };

    case 'Enter':
      // Only intercept when there is something highlighted; otherwise fall
      // through so "Enter searches" keeps working.
      if (activeIndex < 0 || activeIndex >= optionCount) return { kind: 'commit' };
      return { kind: 'select', index: activeIndex };

    case 'Escape':
      return { kind: 'close' };

    default:
      return { kind: 'ignore' };
  }
}

export interface ComboboxKeyboardOptions {
  /** Ids of the rendered options, in visual order. */
  optionIds: string[];
  /** Commit the option at this index (navigate to it). */
  onSelect: (index: number) => void;
  /** Commit with no option highlighted — run the normal submit. */
  onCommit: () => void;
  /** Dismiss the list. */
  onClose: () => void;
  /**
   * Change this to reset the highlight — pass whatever identifies the result
   * set (usually the query). Without it the highlight would survive a new set
   * of results and point at an index that no longer means the same thing.
   */
  resetKey?: string;
}

export interface ComboboxKeyboard {
  /** -1 means nothing is highlighted. */
  activeIndex: number;
  /** Pass to the input's aria-activedescendant; undefined when nothing is active. */
  activeDescendantId: string | undefined;
  /** Spread onto the input's onKeyDown. */
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function useComboboxKeyboard({
  optionIds,
  onSelect,
  onCommit,
  onClose,
  resetKey,
}: ComboboxKeyboardOptions): ComboboxKeyboard {
  const [activeIndex, setActiveIndex] = useState(-1);
  // In a ref so the keydown handler stays stable while still seeing the
  // current highlight — this is the one hot path in the component.
  const activeRef = useRef(-1);
  activeRef.current = activeIndex;

  // A new result set invalidates the old highlight.
  useEffect(() => {
    setActiveIndex(-1);
  }, [resetKey]);

  // Keep the highlight inside the list if it shrank under us.
  useEffect(() => {
    if (activeIndex >= optionIds.length) setActiveIndex(optionIds.length - 1);
  }, [optionIds.length, activeIndex]);

  // Scroll the highlighted option into view — the panel is max-height capped,
  // so arrowing down past the fold would otherwise leave the highlight unseen.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = document.getElementById(optionIds[activeIndex]!);
    // 'nearest' scrolls the minimum needed and does nothing when already
    // visible, so this cannot fight the popover's own scroll anchoring.
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, optionIds]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const action = resolveComboboxKey(e.key, activeRef.current, optionIds.length);

      switch (action.kind) {
        case 'move':
          // Claim the key: the arrows must not also move the text caret.
          e.preventDefault();
          setActiveIndex(action.nextIndex);
          return;

        case 'select':
          e.preventDefault();
          onSelect(action.index);
          return;

        case 'commit':
          // Deliberately NOT preventDefault — the form's own submit handles it.
          onCommit();
          return;

        case 'close':
          if (activeRef.current >= 0) setActiveIndex(-1);
          onClose();
          return;

        case 'ignore':
          return;
      }
    },
    [optionIds, onSelect, onCommit, onClose],
  );

  return {
    activeIndex,
    activeDescendantId: activeIndex >= 0 ? optionIds[activeIndex] : undefined,
    onKeyDown,
  };
}