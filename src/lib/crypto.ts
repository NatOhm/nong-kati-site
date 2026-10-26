/**
 * Constant-time string equality for secrets and tokens (cron secrets, JWT
 * signatures): length first — length is not secret — then a single-pass XOR
 * over the UTF-8 bytes with no early exit.
 *
 * The single shared copy of what were four hand-rolled shims (audit #5,
 * 2026-10-26): orders/expire, promotions/expire, email-outbox/drain, jwt.ts.
 *
 * Deliberately NOT node:crypto's timingSafeEqual: jwt.ts is reachable from
 * client bundles (page → adminCatalog → data → customerAuth → jwt — proven
 * by the `next build` failure when this module used node:crypto), so this
 * module must stay bundle-safe everywhere. Behaviour is pinned by
 * tests/constant-time-equals.test.ts for both server and browser runtimes.
 */

const UTF8 = new TextEncoder();

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = UTF8.encode(a);
  const bufB = UTF8.encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i]! ^ bufB[i]!;
  return diff === 0;
}
