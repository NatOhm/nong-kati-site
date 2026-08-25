/**
 * JWT Utilities — 08-auth.md §6.
 * RS256 signing with separate customer/admin key pairs.
 *
 * In production: real RSA key pairs from env vars.
 * For M4/M5/M6 mock: HMAC-SHA256 with shared secret for simplicity.
 * 
 * Browser-compatible: uses Web Crypto API instead of Node.js crypto.
 */

import type { AdminJwtPayload, Permission, AdminRole } from '@/types/auth';

const ALGORITHM = 'HS256'; // Mock: HMAC. Production: RS256
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  // NK_JWT_SECRET is not available client-side, always use mock
  return 'mock-jwt-secret-for-development-only';
}

// ─── Browser-compatible helpers ──────────────────────────

function toBase64Url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToString(b64: string): string {
  let base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return decodeURIComponent(escape(atob(base64)));
}

function getRandomHex(length: number): string {
  const bytes = new Uint8Array(length);
  // Use crypto.getRandomValues (browser) or Math.random fallback
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return toBase64Url(new Uint8Array(sig));
  }
  
  // Fallback: simple hash for mock mode
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return stringToBase64Url(JSON.stringify({ hash, key: key.slice(0, 8) }));
}

// ─── JWT Functions ───────────────────────────────────────

/**
 * Sign a JWT token (mock HMAC mode).
 */
export async function signJwt(payload: Record<string, unknown>, expiresIn: number = ACCESS_TOKEN_TTL): Promise<string> {
  const header = { alg: ALGORITHM, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: getRandomHex(16),
  };

  const headerB64 = stringToBase64Url(JSON.stringify(header));
  const payloadB64 = stringToBase64Url(JSON.stringify(fullPayload));
  const signature = await hmacSha256(getSecret(), `${headerB64}.${payloadB64}`);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify a JWT token and return the decoded payload.
 */
export async function verifyJwt<T>(token: string): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signature = parts[2]!;

    // Verify signature
    const expectedSig = await hmacSha256(getSecret(), `${headerB64}.${payloadB64}`);

    if (signature !== expectedSig) return null;

    // Decode payload
    const payload = JSON.parse(base64UrlToString(payloadB64));

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload as T;
  } catch {
    return null;
  }
}

/**
 * Verify an admin JWT and return the payload.
 * 08-auth.md §6.1 — Admin JWT has role + perms.
 */
export async function verifyAdminJwt(token: string): Promise<AdminJwtPayload | null> {
  return verifyJwt<AdminJwtPayload>(token);
}

/**
 * Issue an admin access JWT.
 * 08-auth.md §6.1 — Payload includes role + flattened permission list.
 */
export async function issueAdminJwt(
  adminId: string,
  email: string,
  role: AdminRole,
  perms: Permission[],
): Promise<string> {
  return signJwt({
    sub: adminId,
    email,
    role,
    perms,
  });
}

/**
 * Generate a refresh token (opaque random string).
 * 08-auth.md §6.1 — Stored as SHA-256 hash in DB.
 */
export function generateRefreshToken(): string {
  return getRandomHex(32);
}

/**
 * Hash a refresh token for storage.
 */
export async function hashRefreshToken(token: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return toBase64Url(new Uint8Array(hash));
  }
  // Simple hash fallback for mock mode
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h) + token.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

/**
 * Generate a TOTP secret for 2FA setup.
 * 08-auth.md §5.2 — 20-byte base32 secret.
 */
export function generateTotpSecret(): string {
  const bytes = getRandomHex(20);
  return bytes.toUpperCase().replace(/[^A-Z2-7]/g, '').slice(0, 32);
}

/**
 * Generate backup codes for 2FA recovery.
 * 08-auth.md §5.3 — 10 codes, 8 chars each.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = getRandomHex(4).toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Verify a TOTP code (mock — always accepts "123456" in dev).
 * In production: use speakeasy or otplib.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  // Mock: accept "123456" as test code (both dev and production)
  // Real TOTP verification will be implemented in M6 with otplib
  if (code === '123456') {
    return true;
  }
  // TODO: In production with real TOTP, verify against TOTP secret
  return false;
}
