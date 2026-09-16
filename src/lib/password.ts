/**
 * Password hashing — Node.js crypto scrypt (no external dependency).
 * Format: scrypt$N$r$p$saltHex$hashHex — self-describing so parameters
 * can be upgraded later without invalidating existing hashes.
 */

import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'crypto';

const N = 16384; // 2^14 — OWASP minimum for interactive login
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N, r: R, p: P }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = parseInt(parts[1]!, 10);
    const r = parseInt(parts[2]!, 10);
    const p = parseInt(parts[3]!, 10);
    const salt = Buffer.from(parts[4]!, 'hex');
    const expected = Buffer.from(parts[5]!, 'hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scryptCb(password, salt, expected.length, { N: n, r, p }, (err, out) => {
        if (err) reject(err);
        else resolve(out);
      });
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
