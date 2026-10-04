'use client';

/**
 * AnchoredPopover — a dropdown that escapes its ancestors' `overflow`.
 *
 * Bug (diagnosed Oct 4, 2026): the navbar's justify-between row carries
 * `overflow-hidden` as the WCAG 1.4.10 reflow safety net (it must never push
 * the document wider than the viewport). Every popover was an
 * `absolute top-full` child of that row, so all three were clipped: measured
 * search 55/70px hidden, account 291/295px, notifications 318/322px against
 * a bar whose bottom edge is y=64. `z-50` cannot defeat `overflow: hidden` —
 * a clip is applied after stacking, so raising z-index changes nothing.
 *
 * Fix: render into `document.body` through a portal and position with
 * `position: fixed` against the anchor's viewport rect. The panel is no
 * longer a descendant of the clipped row, so nothing can crop it — and the
 * row keeps its `overflow-hidden`, so the reflow guarantee that G1–G4 lock
 * down is untouched. This is why the fix is a portal and not a removal of
 * the overflow guard: deleting `overflow-hidden` would reintroduce the
 * horizontal scrollbar the a11y audit removed.
 *
 * Positioning is measured, not guessed: the panel flips above the anchor
 * when there isn't room below, and clamps to the viewport horizontally so
 * it never opens off-screen on a phone. It follows the anchor on scroll and
 * resize (capture-phase, so scrolling any ancestor repositions it).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the anchor and the panel, in px. */
const GAP = 8;
/** Minimum breathing room kept between the panel and the viewport edge. */
const MARGIN = 8;
/** Above the navbar's own z-50 so a portaled panel always paints over it. */
const Z_INDEX = 100;

interface Position {
  top: number;
  left: number;
  /** Only set when `matchAnchorWidth` is on. */
  width?: number;
}

export interface AnchoredPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The trigger element. Its rect drives placement. */
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  /** `end` aligns the panel's right edge with the anchor's (nav actions). */
  align?: 'start' | 'end';
  /**
   * Stretch the panel to the anchor's width.
   *
   * Needed by any caller whose panel used to be `absolute` with `w-full`:
   * once portaled, `w-full` resolves against <body>, not the anchor, so a
   * dropdown that was previously exactly as wide as its input would suddenly
   * span the whole viewport. Set this and drop `w-full` from className.
   */
  matchAnchorWidth?: boolean;
  role?: string;
  ariaLabel?: string;
  id?: string;
}

export function AnchoredPopover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  align = 'end',
  matchAnchorWidth = false,
  role,
  ariaLabel,
  id,
}: AnchoredPopoverProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;

    const spaceBelow = vh - rect.bottom - GAP - MARGIN;
    const spaceAbove = rect.top - GAP - MARGIN;
    // Prefer below; flip above only when below is the worse of the two.
    const flip = panelH > spaceBelow && spaceAbove > spaceBelow;

    let top = flip ? rect.top - GAP - panelH : rect.bottom + GAP;
    top = Math.max(MARGIN, Math.min(top, vh - panelH - MARGIN));

    let left = align === 'end' ? rect.right - panelW : rect.left;
    left = Math.max(MARGIN, Math.min(left, vw - panelW - MARGIN));

    // The anchor width, clamped to what the viewport can actually show, so a
    // wide anchor on a narrow phone cannot push the panel off-screen.
    // `exactOptionalPropertyTypes` is on, so `width: undefined` is not the
    // same as omitting the key — build the object conditionally.
    const position: Position = { top, left };
    if (matchAnchorWidth) position.width = Math.min(rect.width, vw - 2 * MARGIN);

    setPosition(position);
  }, [align, anchorRef, matchAnchorWidth]);

  // Measure before paint so the panel never flashes at the wrong spot.
  //
  // `mounted` MUST be a dependency. The portal is not rendered until the
  // client-mount effect has flipped it, so on the first pass after `open`
  // goes true the panel ref is still null, reposition() bails, and without
  // this dep the effect would never re-run once the panel finally exists —
  // leaving the panel parked at the off-screen -9999 fallback.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    if (!mounted) return;
    reposition();
  }, [open, mounted, reposition]);

  // Follow the anchor: capture-phase scroll catches every scrollable
  // ancestor, not just the window.
  useEffect(() => {
    if (!open) return;
    const onChange = () => reposition();
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
    };
  }, [open, reposition]);

  // Dismiss on outside click (panel included — it lives outside the anchor's
  // subtree now) and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        ...(position?.width !== undefined ? { width: position.width } : {}),
        // Hidden until measured, so the first frame can't appear at 0,0.
        visibility: position ? 'visible' : 'hidden',
        zIndex: Z_INDEX,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}