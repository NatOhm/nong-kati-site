// @vitest-environment jsdom
/**
 * Mobile overlays own two pieces of browser state that are easy to corrupt:
 * the history stack (back button / iOS swipe-back) and the scroll position
 * (iOS ignores `body { overflow: hidden }`).
 *
 *   H1  opening pushes exactly one history entry carrying the overlay marker,
 *   H2  a back press that lands on someone else's entry dismisses the overlay,
 *   H3  dismissing from the UI pops that entry, so the next back is a page,
 *   H4  stacked overlays peel off in reverse order (inner first, outer last),
 *   H5  no overlay open → the hook touches history at all.
 *
 *   S1  the lock freezes the body at -scrollY and restores styles on close,
 *   S2  closing restores the exact offset the page had when it opened,
 *   S3  nested overlays unlock once, on the last close,
 *   S4  a close caused by navigation restores styles but not the old offset.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOverlayDismiss, useScrollLock } from '@/hooks/useMobileOverlay';

interface OverlayState {
  __nkOverlay?: number | undefined;
}

function overlayId(): number | undefined {
  return (window.history.state as OverlayState | null)?.__nkOverlay;
}

function Harness({
  open,
  onClose,
  lock = true,
}: {
  open: boolean;
  onClose: () => void;
  lock?: boolean;
}): React.JSX.Element {
  useOverlayDismiss(open, onClose);
  useScrollLock(lock && open);
  return <div data-testid="overlay-shell">{open ? 'open' : 'closed'}</div>;
}

function backTo(state: OverlayState): void {
  act(() => {
    window.history.replaceState(state, '');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeEach(() => {
  window.history.replaceState({}, '');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOverlayDismiss — back button / swipe-back', () => {
  it('H1: opening pushes one entry marked for this overlay', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);

    expect(push).not.toHaveBeenCalled();

    rerender(<Harness open onClose={onClose} />);

    expect(push).toHaveBeenCalledTimes(1);
    expect(overlayId()).toBeTypeOf('number');
  });

  it('H2: a back press that lands outside the entry dismisses the overlay', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    backTo({});

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('H3: UI dismissal pops its own entry so the next back is a normal page', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    rerender(<Harness open={false} onClose={onClose} />);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('H4: stacked overlays peel off in reverse order, one back each', () => {
    const closeOuter = vi.fn();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender: rerenderOuter } = render(<Harness open onClose={closeOuter} />);
    const outerId = overlayId();
    if (outerId === undefined) throw new Error('outer overlay pushed no history entry');

    const closeInner = vi.fn();
    const { rerender: rerenderInner } = render(<Harness open onClose={closeInner} />);
    const innerId = overlayId();
    if (innerId === undefined) throw new Error('inner overlay pushed no history entry');
    expect(innerId, 'each overlay gets its own entry').not.toBe(outerId);

    // First back lands on the outer entry: only the inner overlay closes.
    backTo({ __nkOverlay: outerId });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();

    // Second back leaves the overlay stack entirely: the outer closes too.
    backTo({});
    expect(closeOuter).toHaveBeenCalledTimes(1);

    // Unmounting after a back-dismissal must not pop again.
    rerenderInner(<Harness open={false} onClose={closeInner} />);
    rerenderOuter(<Harness open={false} onClose={closeOuter} />);
    expect(back).not.toHaveBeenCalled();
  });

  it('H5: no overlay means history is never touched', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();

    render(<Harness open={false} onClose={onClose} />);
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useScrollLock — iOS-safe background freeze', () => {
  function setScrollY(value: number): void {
    Object.defineProperty(window, 'scrollY', { value, configurable: true });
  }

  it('S1: freezes the body at the current offset and restores styles on close', () => {
    setScrollY(640);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-640px');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.width).toBe('100%');

    rerender(<Harness open={false} onClose={onClose} />);

    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('S2: restores exactly the offset the page had when it opened', () => {
    setScrollY(2137);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);
    // The page cannot move while the body is fixed — a wheel/space scroll
    // attempt leaves the frozen offset where it was.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });

    rerender(<Harness open={false} onClose={onClose} />);

    expect(scrollTo).toHaveBeenCalledWith(0, 2137);
  });

  it('S3: nested overlays keep the lock until the last one closes', () => {
    setScrollY(300);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const noop = vi.fn();
    const { rerender: rerenderA } = render(<Harness open onClose={noop} />);
    const { rerender: rerenderB } = render(<Harness open onClose={noop} />);

    rerenderB(<Harness open={false} onClose={noop} />);
    expect(document.body.style.position).toBe('fixed');
    expect(scrollTo).not.toHaveBeenCalled();

    rerenderA(<Harness open={false} onClose={noop} />);
    expect(document.body.style.position).toBe('');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 300);
  });

  it('S4: closing because the route changed restores styles but not the old offset', () => {
    setScrollY(500);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    window.history.pushState({}, '', '/checkout');
    rerender(<Harness open={false} onClose={onClose} />);

    expect(document.body.style.position).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();

    window.history.pushState({}, '', '/');
  });
});
