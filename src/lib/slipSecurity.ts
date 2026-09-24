/**
 * Slip upload capability tokens + storage keys.
 *
 * Uploads are authorized by an HMAC token minted server-side when the order
 * is created. Proof of an order ID alone is not enough — the caller must
 * present HMAC(orderId, confirmationUuid) which only the legitimate
 * checkout response contains (the confirmation UUID never leaves the
 * confirmation URL of the customer who created the order).
 *
 * Slips are stored under a private `slip:` key namespace in SiteSetting.
 * The public /api/v1/images/[key] route refuses that namespace, so slips
 * are only reachable through:
 *   - /api/v1/payments/slip-download/[key] (admin, Bearer + orders:read, or
 *     the order's own upload token)
 *   - the checkout flow itself right after upload
 *
 * Storage still lives in the DB (SiteSetting) as today; moving blobs to a
 * private object store (Supabase Storage) can later reuse these helpers.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function macKey(): string {
  // Server-side only. Distinct env var keeps rotation independent from the
  // JWT secret; dev fallback keeps local dev working.
  return (
    process.env['NK_SLIP_TOKEN_SECRET'] ??
    process.env['NK_JWT_SECRET'] ??
    'dev-only-insecure-secret'
  );
}

function mac(orderId: string, confirmationUuid: string): string {
  return createHmac('sha256', macKey()).update(`${orderId}:${confirmationUuid}`).digest('base64url');
}

/** Token format: <confirmationUuid>.<base64url HMAC> */
export function mintSlipUploadToken(orderId: string, confirmationUuid: string): string {
  return `${confirmationUuid}.${mac(orderId, confirmationUuid)}`;
}

export function isValidSlipUploadToken(orderId: string, token: string): boolean {
  if (!orderId || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const confirmationUuid = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = mac(orderId, confirmationUuid);
  const a = Buffer.from(sig);
  const unit8 = Buffer.from(expected);
  return a.length === unit8.length && timingSafeEqual(a, unit8);
}

/** Cryptographically random storage key in the private `slip:` namespace. */
export function mintSlipStorageKey(): string {
  return `slip:${randomBytes(16).toString('hex')}`;
}

/** Admin-authorized download route for a stored slip. */
export function slipImageRoute(storageKey: string): string {
  return `/api/v1/payments/slip-download/${encodeURIComponent(storageKey.slice('slip:'.length))}`;
}
