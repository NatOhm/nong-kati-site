/**
 * Production-review fixes: JSON-LD XSS + recovery coupon accounting.
 *
 * 1. [High] `JSON.stringify` does not make text safe inside an HTML
 *    <script> element — a stored `</script>` in product name/description
 *    (catalogue managers hold products:write; imports can carry it too)
 *    terminated the element and executed on the public origin.
 *    serializeJsonLd escapes < > & U+2028/U+2029 to \uXXXX: the JSON is
 *    semantically identical, but no `</script>` sequence can appear.
 *
 * 2. [Medium] The slip-verify stock-shortage recovery parked discounted
 *    orders WITHOUT going through claimOrderForConfirmation — coupon
 *    global/per-customer usage was never counted, and the restock-resume
 *    path assumed it had been. The recovery now claims through the shared
 *    helper; this test pins that the claim (not a bare order updateMany)
 *    happens inside the recovery transaction.
 */
import { describe, expect, it, vi } from 'vitest';

describe('serializeJsonLd — JSON-LD XSS escape (production review, High)', () => {
  it('escapes a closing script sequence so no element can be terminated', async () => {
    const { serializeJsonLd } = await import('@/components/data-display/StructuredData');
    const payload = {
      name: '</script><script>window.__xss=1</script>',
      description: 'innocent & <b>bold</b> text',
    };
    const html = serializeJsonLd(payload);

    // No markup-terminating sequence survives anywhere in the output.
    expect(html.toLowerCase()).not.toContain('</script');
    expect(html).not.toContain('<script');
    // And the payload characters are escaped, not raw.
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('\\u0026');
    expect(html).not.toContain('&');

    // Parsed back, the JSON is semantically identical — consumers see the
    // original strings.
    const parsed = JSON.parse(html) as typeof payload;
    expect(parsed.name).toBe('</script><script>window.__xss=1</script>');
    expect(parsed.description).toBe('innocent & <b>bold</b> text');
  });

  it('escapes line separators U+2028/U+2029 (valid JS, invalid JSON-LD in old parsers)', async () => {
    const { serializeJsonLd } = await import('@/components/data-display/StructuredData');
    const html = serializeJsonLd({ name: 'a\u2028b\u2029c' });
    expect(html).not.toContain('\u2028');
    expect(html).not.toContain('\u2029');
    expect((JSON.parse(html) as { name: string }).name).toBe('a\u2028b\u2029c');
  });

  it('escapes every string in the value tree, not just top-level fields', async () => {
    const { serializeJsonLd } = await import('@/components/data-display/StructuredData');
    const html = serializeJsonLd({
      nested: { deep: ['</script>', { x: '<img src=x onerror=alert(1)>' }] },
    });
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('\\u003cimg');
  });

  it('the StructuredData component renders through the safe serializer', async () => {
    // Static guard (JSX is not executed under the vitest node environment):
    // the component must pass its schema through serializeJsonLd, never a
    // bare JSON.stringify.
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/data-display/StructuredData.tsx', 'utf8');
    expect(src).toContain('dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}');
    expect(src).not.toContain('dangerouslySetInnerHTML={{ __html: JSON.stringify(');
    // And the helper is exported from the same reviewed module.
    expect(src).toContain('export function serializeJsonLd');
  });
});

describe('slip-verify recovery claims through the shared helper (production review, Medium)', () => {
  it('the recovery transaction uses claimOrderForConfirmation, not a bare order updateMany', async () => {
    // Static assertion on the route source: the recovery block must call the
    // shared claim helper. (The full behavioural fault-injection lives in
    // tests/payment-recovery.test.ts, which mocks the helper — this guards
    // against someone re-inlining a bare updateMany that skips coupons.)
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/app/api/v1/payments/slip-verify/route.ts', 'utf8');
    const recovery = src.slice(src.indexOf('INSUFFICIENT_STOCK') /* first marker */);
    expect(recovery).toContain('claimOrderForConfirmation(order.id, tx, { paidExternally: true })');
    // No bare order-status write inside the recovery transaction.
    expect(recovery).not.toMatch(/tx\.order\.updateMany\(/);
    expect(recovery).toContain("manualFulfilmentReason: 'INSUFFICIENT_STOCK'");
  });
});
