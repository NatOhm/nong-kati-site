/**
 * Gift Code Encryption — AES-256-GCM, application-layer.
 * 10-digital-code.md §3 — Codes never stored in plaintext.
 *
 * Key: NK_GIFT_CODE_ENCRYPTION_KEY (32-byte hex in env)
 * Nonce: 12 bytes, cryptographically random, unique per encryption.
 * Auth tag: 16 bytes, appended to ciphertext in code_encrypted column.
 *
 * Dedup hash: SHA-256 of plaintext code, stored in code_hash column.
 * Global uniqueness across all variants.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * 32 bytes (256 bits), hex-encoded.
 */
function getKey(): Buffer {
  const keyHex = process.env['NK_GIFT_CODE_ENCRYPTION_KEY'];
  if (!keyHex) {
    throw new Error('NK_GIFT_CODE_ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext gift code.
 * Returns ciphertext (with auth tag appended), nonce, and auth tag separately.
 *
 * @param plainCode - The plaintext code (e.g. "ABCD-EFGH-IJKL-MNOP")
 * @returns { ciphertext, nonce, authTag } — all Buffers
 */
export function encryptCode(plainCode: string): {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
} {
  const key = getKey();
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGO, key, nonce);

  const encrypted = Buffer.concat([
    cipher.update(plainCode, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Store authTag appended to ciphertext (single BYTEA column)
  return {
    ciphertext: Buffer.concat([encrypted, authTag]),
    nonce,
    authTag,
  };
}

/**
 * Decrypt a ciphertext buffer (with appended auth tag) back to plaintext.
 *
 * @param ciphertextWithTag - ciphertext + auth tag (last 16 bytes)
 * @param nonce - the 12-byte nonce used during encryption
 * @returns decrypted plaintext string
 */
export function decryptCode(
  ciphertextWithTag: Buffer,
  nonce: Buffer,
): string {
  const key = getKey();

  if (ciphertextWithTag.length < AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext too short — missing auth tag');
  }

  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Compute SHA-256 hash of a plaintext code for deduplication.
 * Code is trimmed and uppercased before hashing.
 *
 * @param plainCode - The plaintext code
 * @returns 32-byte Buffer (SHA-256 digest)
 */
export function hashCode(plainCode: string): Buffer {
  return createHash('sha256')
    .update(plainCode.trim().toUpperCase())
    .digest();
}

/**
 * Mask a code for display (show last 4 chars only).
 * e.g. "ABCD-EFGH-IJKL-MNOP" → "****-****-****-MNOP"
 */
export function maskCode(plainCode: string): string {
  const parts = plainCode.split('-');
  if (parts.length <= 1) {
    // No dashes — show last 4 chars
    return '*'.repeat(Math.max(0, plainCode.length - 4)) + plainCode.slice(-4);
  }
  return parts.map((part, i) => {
    if (i === parts.length - 1) return part;
    return '*'.repeat(part.length);
  }).join('-');
}

/**
 * Generate a random encryption key for initial setup.
 * Returns hex-encoded 32-byte key.
 */
export function generateKey(): string {
  return randomBytes(32).toString('hex');
}
