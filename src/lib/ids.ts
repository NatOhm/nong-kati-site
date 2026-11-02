/**
 * Crypto-safe ID helper — one home for `prefix_<random>` IDs.
 * Math.random() is guessable and can collide within the same millisecond;
 * WebCrypto is available in every supported runtime (browsers + Node 19+).
 */
export function newId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
