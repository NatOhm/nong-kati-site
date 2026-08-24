/**
 * JWT Utilities — 08-auth.md §6.
 * RS256 signing with separate customer/admin key pairs.
 *
 * In production: real RSA key pairs from env vars.
 * For M4/M5/M6 mock: HMAC-SHA256 with shared secret for simplicity.
 *
 * Env vars:
 *   NK_ADMIN_JWT_PRIVATE_KEY (RSA private key, PEM)
 *   NK_ADMIN_JWT_PUBLIC_KEY (RSA public key, PEM)
 *   NK_CUSTOMER_JWT_PRIVATE_KEY
 *   NK_CUSTOMER_JWT_PUBLIC_KEY
 *   NK_JWT_SECRET (fallback for mock mode)
 */

import { createSign, createVerify, createHmac, createHash, randomBytes } from 'crypto';
import type { AdminJwtPayload, Permission, AdminRole } from '@/types/auth';

const ALGORITHM = 'HS256'; // Mock: HMAC. Production: RS256
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  const secret = process.env['NK_JWT_SECRET'];
  return secret ?? 'mock-jwt-secret-for-development-only';
}

/**
 * Sign a JWT token (mock HMAC mode).
 */
export function signJwt(payload: Record<string, unknown>, expiresIn: number = ACCESS_TOKEN_TTL): string {
  const header = { alg: ALGORITHM, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: randomBytes(16).toString('hex'),
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = createHmac('sha256', getSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify a JWT token and return the decoded payload.
 */
export function verifyJwt<T>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signature = parts[2]!;

    // Verify signature
    const expectedSig = createHmac('sha256', getSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

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
export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  return verifyJwt<AdminJwtPayload>(token);
}

/**
 * Issue an admin access JWT.
 * 08-auth.md §6.1 — Payload includes role + flattened permission list.
 */
export function issueAdminJwt(
  adminId: string,
  email: string,
  role: AdminRole,
  perms: Permission[],
): string {
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
  return randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a TOTP secret for 2FA setup.
 * 08-auth.md §5.2 — 20-byte base32 secret.
 */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  return bytes.toString('base64').replace(/[^A-Z2-7]/g, '').slice(0, 32);
}

/**
 * Generate backup codes for 2FA recovery.
 * 08-auth.md §5.3 — 10 codes, 8 chars each.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Verify a TOTP code (mock — always accepts "123456" in dev).
 * In production: use speakeasy or otplib.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  // Mock: accept "123456" in development
  if (process.env['NODE_ENV'] !== 'production' && code === '123456') {
    return true;
  }
  // In production: verify against TOTP secret
  return false;
}
