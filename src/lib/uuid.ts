/**
 * `crypto.randomUUID` landed in Safari 15.4 and needs a secure context. The
 * cart's session key and every toast are created on the client, so an iPhone
 * on iOS 15.0–15.3 (or any http preview) hit
 * `TypeError: crypto.randomUUID is not a function` on the first add-to-cart,
 * not a degraded experience — the product never reached the cart.
 *
 * Same v4 shape, built from `getRandomValues`, which Safari has had since 11.
 * Server code keeps using `crypto.randomUUID` (Node ≥ 20) directly.
 */
export function randomUUID(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  // RFC 4122 version 4 + variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
