/**
 * Containing-block guard — one owner for the transform/fill-mode rule.
 *
 * Three production defects came from the same hazard: any element that keeps
 * a `transform` (or `will-change`/`filter`) becomes the containing block for
 * its `position: fixed` descendants. A `fixed` overlay then anchors to that
 * box instead of the viewport.
 *
 *   1. `ScrollReveal` kept `will-change-transform` after reveal → the homepage
 *      quick-view dialog landed offset inside the featured section.
 *   2. `QuickViewModal` rendered inside the page tree → fixed layers trapped
 *      by whatever wrapper happened to be transformed.
 *   3. `.page-enter` used `animation-fill-mode: both`, so its final
 *      `translateY(0)` stayed applied forever on the route wrapper → the phone
 *      sticky buy bar, the cart drawer and ScrollToTop all scrolled away.
 *
 * The hazard is invisible in jsdom (no layout) and invisible in review (the
 * offending class is usually one token in a className). So it is asserted
 * here, from the source, on the four customer surfaces:
 *
 *   G1 — route entry has ONE owner: `.page-enter` in globals.css, and it keeps
 *        no forward fill. (Tailwind previously defined a second
 *        `animate-page-enter` with a different duration — two owners, and the
 *        page picked whichever class the author typed.)
 *   G2 — no animation utility may hold its final keyframe applied when that
 *        keyframe sets a transform. Docs-overlay exits are the only exception:
 *        they animate the overlay itself and the node unmounts afterwards.
 *   G3 — ScrollReveal's revealed branch carries no transform/will-change.
 *   G4 — overlays that must escape any transformed ancestor are portaled
 *        (quick-view modal, anchored popover), and the shell-level fixed
 *        surfaces (mobile taskbar, announcement bar) are mounted from layouts,
 *        never re-created inside a page — that is what keeps them out of the
 *        animated route wrapper entirely.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import tailwind from '../tailwind.config';

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** Animations allowed to keep their final keyframe: they animate the overlay
 *  itself and the node unmounts right after, so nothing anchors to them. */
const SELF_ANIMATING_EXITS = new Set(['modal-exit', 'toast-exit']);

const TRANSFORM_KEYS = ['transform', 'translate', 'scale', 'rotate', 'willChange'];

type Step = Record<string, unknown>;

const extend = (tailwind.theme?.extend ?? {}) as {
  animation?: Record<string, string>;
  keyframes?: Record<string, Record<string, Step>>;
};
const animations = extend.animation ?? {};
const keyframes = extend.keyframes ?? {};

function css(path: string, selector: string): string {
  const source = read(path);
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} block missing from ${path}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

/** The last declared step of an animation's keyframes. */
function finalStep(name: string): Step | null {
  const frames = keyframes[name];
  if (!frames) return null;
  const keys = Object.keys(frames);
  const lastKey = keys[keys.length - 1] ?? '';
  if (!/^(to|100%)\s*$/.test(lastKey)) return null;
  return frames[lastKey] ?? null;
}

describe('G1 — route entry has exactly one owner and no retained transform', () => {
  it('globals.css `.page-enter` never fills forwards', () => {
    const block = css('src/app/globals.css', '.page-enter');
    expect(block).toMatch(/animation:\s*page-enter/);
    expect(block).not.toMatch(/\b(both|forwards)\b/);
  });

  it('tailwind defines no competing `page-enter` utility', () => {
    expect(Object.keys(animations)).not.toContain('page-enter');
    expect(Object.keys(keyframes)).not.toContain('page-enter');
  });

  it('no component reaches for the old utility name', () => {
    const offenders = ['src/components/layout/PageShell.tsx', 'src/app/recommended/page.tsx'].filter(
      (file) => read(file).includes('animate-page-enter'),
    );
    expect(offenders).toEqual([]);
  });
});

describe('G2 — a forward fill never freezes a transform', () => {
  const filled = Object.entries(animations).filter(([, value]) =>
    /\b(both|forwards)\b/.test(value),
  );

  it('has at least one exit animation, so the rule is exercised', () => {
    expect(filled.length).toBeGreaterThan(0);
  });

  it('every forward-filled animation ends without a transform', () => {
    const offenders = filled
      .filter(([name]) => !SELF_ANIMATING_EXITS.has(name))
      .filter(([name, value]) => {
        const step = finalStep(value.split(' ')[0]!) ?? finalStep(name);
        if (!step) return false;
        return TRANSFORM_KEYS.some((key) => key in step);
      })
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('the exit exceptions really only animate opacity + transform on a dying node', () => {
    for (const name of SELF_ANIMATING_EXITS) {
      expect(animations[name], `${name} is no longer a defined animation`).toBeDefined();
      expect(animations[name]).toMatch(/\bboth\b/);
    }
  });
});

describe('G3 — revealed sections stop being containing blocks', () => {
  it('ScrollReveal applies will-change/transform only before reveal', () => {
    const src = read('src/components/home/ScrollReveal.tsx');
    const at = src.indexOf('isVisible ?');
    expect(at).toBeGreaterThan(-1);
    const isVisibleBranch = src.slice(at).match(/^isVisible \? '([^']*)'/)?.[1];
    expect(isVisibleBranch).toBe('opacity-100');
    // …and the pre-reveal branch must still animate.
    expect(src.slice(at)).toMatch(/will-change-transform/);
  });
});

describe('G4 — fixed customer surfaces can escape any transformed ancestor', () => {
  it('in-route overlays are portaled to the document body', () => {
    for (const file of [
      'src/components/product/QuickViewModal.tsx',
      'src/components/ui/AnchoredPopover.tsx',
    ]) {
      const src = read(file);
      expect(src, `${file} renders a fixed overlay and must portal it`).toMatch(
        /createPortal\(\s*[\s\S]*document\.body/,
      );
    }
  });

  it('shell fixed surfaces are mounted from layouts, not from pages', () => {
    expect(read('src/app/layout.tsx')).toMatch(/<MobileBottomNav\s*\/>/);
    expect(read('src/components/layout/FacebookLayout.tsx')).toMatch(/<AnnouncementBar\s*\/>/);

    const pages = ['src/app/page.tsx', 'src/app/recommended/page.tsx'];
    for (const page of pages) {
      expect(read(page)).not.toMatch(/<MobileBottomNav|<AnnouncementBar/);
    }
  });
});
