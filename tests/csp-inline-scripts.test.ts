/**
 * The CSP smoke gate (e2e/smoke.spec.ts) walks prerendered-style routes and
 * fails if an inline script arrived without the per-request nonce. That check
 * went red on /legal/privacy-policy on CI 2026-11-24 for a page whose JS layer
 * was healthy: the only nonce-less tag was the breadcrumb's
 * `<script type="application/ld+json">`, a data block the policy in
 * src/middleware.ts deliberately does not nonce.
 *
 * These cases pin the line between "executable, must be nonced" and "data
 * block, not the gate's business" so the gate cannot be widened back into a
 * false alarm, nor narrowed until a real bake-in slips through.
 */

import { describe, expect, it } from 'vitest';

import {
  inlineScriptTags,
  isExecutableInlineScript,
  nonceLessExecutableInlineScripts,
} from '../e2e/inline-script-csp';

const NONCE = 'nonce="N0abc+/="';

describe('inline script classification for the CSP gate', () => {
  it('flags a nonce-less bootstrap script — the bake-in the gate exists to catch', () => {
    const html = `<script>self.__next_f.push([1,"x"])</script>`;

    expect(nonceLessExecutableInlineScripts(html)).toHaveLength(1);
  });

  it('accepts a nonced bootstrap script', () => {
    const html = `<script ${NONCE}>self.__next_f.push([1,"x"])</script>`;

    expect(nonceLessExecutableInlineScripts(html)).toEqual([]);
  });

  it('does not count a JSON-LD data block as a missing nonce (the 2026-11-24 red CI)', () => {
    const html = [
      `<script ${NONCE}>self.__next_f.push([1,"x"])</script>`,
      '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>',
    ].join('');

    expect(nonceLessExecutableInlineScripts(html)).toEqual([]);
  });

  it('still requires a nonce on module scripts, and tolerates legacy JS types', () => {
    const types = ['module', 'text/javascript', 'application/javascript', 'TEXT/JAVASCRIPT'];

    for (const type of types) {
      expect(isExecutableInlineScript(`<script type="${type}">x()</script>`)).toBe(true);
      expect(nonceLessExecutableInlineScripts(`<script type="${type}">x()</script>`)).toHaveLength(1);
      expect(nonceLessExecutableInlineScripts(`<script type="${type}" ${NONCE}>x()</script>`)).toEqual(
        [],
      );
    }
  });

  it('treats other data blocks and untyped-vs-typed case variants as data, not failures', () => {
    const dataBlocks = [
      '<script type="application/json">{}</script>',
      '<script type="text/template"><p>hi</p></script>',
      '<script TYPE="Application/LD+JSON">{}</script>',
    ];

    for (const tag of dataBlocks) {
      expect(isExecutableInlineScript(tag), tag).toBe(false);
      expect(nonceLessExecutableInlineScripts(tag), tag).toEqual([]);
    }
  });

  it('ignores external scripts entirely — src presence means no inline body', () => {
    const html = `<script src="/_next/static/chunks/main.js" defer></script>`;

    expect(inlineScriptTags(html)).toEqual([]);
  });

  it('reads every inline tag in document order, including ones with nonce', () => {
    const html = `<script ${NONCE}>a()</script><script>b()</script>`;

    expect(inlineScriptTags(html)).toHaveLength(2);
    expect(nonceLessExecutableInlineScripts(html)).toHaveLength(1);
  });
});
