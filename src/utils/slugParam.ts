/**
 * Decode a dynamic route segment for a database lookup.
 *
 * Next hands `params` to the page PERCENT-ENCODED: getDynamicParam calls
 * `encodeURIComponent(value)` on every segment (next/dist/shared/lib/router/
 * utils/get-dynamic-param.js). So `/product/microsoft-365-30-วัน-ytbr` reaches
 * the page as `microsoft-365-30-%E0%B8%A7...`, and a direct `slug` lookup
 * matches nothing → notFound() → the product 404s. ASCII slugs never showed
 * the bug because encodeURIComponent leaves them untouched — which is why
 * only the Thai-slug products were "กดเข้าไปดูไม่ได้" (client report
 * 2026-11-02).
 *
 * A malformed escape (a stray `%` in the path) returns the input unchanged
 * instead of throwing: a 404 is the right answer there, a 500 is not.
 */
export function decodeSlugParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
