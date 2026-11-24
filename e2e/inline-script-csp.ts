/**
 * What the CSP smoke gate is actually allowed to demand.
 *
 * The gate exists to prove Next's bootstrap scripts are alive: a prerendered
 * page used to ship them without the per-request nonce, the enforced policy
 * blocked them, and /account/login rendered as an empty page.
 *
 * Data blocks are a different thing. `<script type="application/ld+json">` is
 * never executed, so `src/middleware.ts` deliberately does not nonce it ("…
 * ld+json">` and need no nonce"). Counting those as failures made the gate red
 * for a healthy page the moment a breadcrumb added JSON-LD to the legal routes
 * (CI 2026-11-24, /legal/privacy-policy: 14 nonced bootstrap scripts, 1 data
 * block). So: executable inline scripts must carry the nonce; data blocks are
 * not the gate's business.
 */

const INLINE_SCRIPT_TAG = /<script(?![^>]*\bsrc=)[^>]*>/gi;
const TYPE_ATTR = /\btype\s*=\s*["']([^"']*)["']/i;
const NONCE_ATTR = /\bnonce\s*=/i;

/** Every inline `<script …>` open tag in the served HTML, in document order. */
export function inlineScriptTags(html: string): string[] {
  return html.match(INLINE_SCRIPT_TAG) ?? [];
}

/**
 * A script tag with no `type`, or a JavaScript one, is executed by the browser.
 * Anything else (ld+json, json, text/template, …) is a data block.
 */
export function isExecutableInlineScript(tag: string): boolean {
  const type = tag.match(TYPE_ATTR)?.[1]?.split(';')[0]?.trim().toLowerCase();
  if (!type) return true;
  return (
    type === 'module' ||
    type === 'text/javascript' ||
    type === 'application/javascript' ||
    type === 'text/ecmascript' ||
    type === 'application/ecmascript'
  );
}

/** Executable inline scripts that arrived without a nonce — the real failure. */
export function nonceLessExecutableInlineScripts(html: string): string[] {
  return inlineScriptTags(html).filter((tag) => isExecutableInlineScript(tag) && !NONCE_ATTR.test(tag));
}
