/**
 * Gift Code Encryption — AES-256-GCM, application-layer.
 * 10-digital-code.md §3 — Codes never stored in plaintext.
 *
 * Key ring (rotation, per secret-rotation-checklist.md Step 4):
 *   keyVersion 1 → NK_GIFT_CODE_ENCRYPTION_KEY      (original/current key)
 *   keyVersion 2 → NK_GIFT_CODE_ENCRYPTION_KEY_V2   (rotation key). Falls back to the
 *                   V1 variable when unset — that is the post-cutover state: base env
 *                   swapped to the new key, V2 var deleted, and existing version-2
 *                   rows keep decrypting with the same key material.
 *   New rows are stamped with NK_GIFT_CODE_ACTIVE_KEY_VERSION (default 1).
 *
 * Nonce: 12 bytes, cryptographically random, unique per encryption.
 * Auth tag: 16 bytes, appended to ciphertext in code_encrypted column.
 *
 * Dedup hash: SHA-256 of plaintext code, stored in code_hash column.
 * Global uniqueness across all variants (key-independent — unchanged by rotation).
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type GiftKeyVersion = 1 | 2;

const V1_ENV = 'NK_GIFT_CODE_ENCRYPTION_KEY';
const V2_ENV = 'NK_GIFT_CODE_ENCRYPTION_KEY_V2';

/**
 * Get the key for a specific key version from the environment.
 * 32 bytes (256 bits), hex-encoded. Fail-closed: missing or malformed keys throw.
 *
 * V2 falls back to the V1 variable once `NK_GIFT_CODE_ENCRYPTION_KEY_V2` has been
 * removed (final rotation step) — version-2 rows were re-encrypted with the same
 * key the base variable then holds, so decryption stays correct.
 */
function keyForVersion(version: GiftKeyVersion): Buffer {
  const v1Hex = process.env[V1_ENV];
  if (!v1Hex) {
    throw new Error(`${V1_ENV} environment variable is not set`);
  }

  const v2Hex = process.env[V2_ENV];
  const keyHex = version === 2 ? v2Hex || v1Hex : v1Hex;
  const envName = version === 2 && v2Hex ? V2_ENV : V1_ENV;

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      `${envName} must be 64 hex chars (32 bytes) — got ${keyHex.length} chars; refusing to derive a weak key`,
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Key version stamped onto newly encrypted codes (persisted as GiftCode.keyVersion).
 * Default 1; set NK_GIFT_CODE_ACTIVE_KEY_VERSION=2 only while a rotation is in
 * flight, so codes uploaded mid-rotation are already on the new key.
 */
export function activeKeyVersion(): GiftKeyVersion {
  const raw = process.env['NK_GIFT_CODE_ACTIVE_KEY_VERSION'];
  if (!raw) return 1;
  const parsed = Number(raw);
  if (parsed !== 1 && parsed !== 2) {
    throw new Error(`NK_GIFT_CODE_ACTIVE_KEY_VERSION must be 1 or 2 — got "${raw}"`);
  }
  return parsed;
}

/**
 * Encrypt a plaintext gift code with the active (or requested) key version.
 * Returns ciphertext (with auth tag appended), nonce, auth tag, and the
 * keyVersion to persist alongside them.
 *
 * @param plainCode - The plaintext code (e.g. "ABCD-EFGH-IJKL-MNOP")
 * @param keyVersion - Override the active key version (defaults to activeKeyVersion())
 * @returns { ciphertext, nonce, authTag, keyVersion } — all Buffers + version
 */
export function encryptCode(
  plainCode: string,
  keyVersion: GiftKeyVersion = activeKeyVersion(),
): {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: GiftKeyVersion;
} {
  const key = keyForVersion(keyVersion);
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGO, key, nonce);

  const encrypted = Buffer.concat([cipher.update(plainCode, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Store authTag appended to ciphertext (single BYTEA column)
  return {
    ciphertext: Buffer.concat([encrypted, authTag]),
    nonce,
    authTag,
    keyVersion,
  };
}

/**
 * Decrypt a ciphertext buffer (with appended auth tag) back to plaintext,
 * using the key version recorded on the row.
 *
 * @param ciphertextWithTag - ciphertext + auth tag (last 16 bytes)
 * @param nonce - the 12-byte nonce used during encryption
 * @param keyVersion - keyVersion from the GiftCode row (default 1 = original key)
 * @returns decrypted plaintext string
 */
export function decryptCode(
  ciphertextWithTag: Buffer,
  nonce: Buffer,
  keyVersion: number = 1,
): string {
  // Fail loudly on versions this build doesn't know (e.g. old code meeting a
  // keyVersion-3 row after a future rotation) instead of decrypting with the wrong key.
  if (keyVersion !== 1 && keyVersion !== 2) {
    throw new Error(
      `GiftCode keyVersion ${keyVersion} is not supported by this build (knows 1–2) — deploy newer code before reading these rows`,
    );
  }
  const key = keyForVersion(keyVersion);

  if (ciphertextWithTag.length < AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext too short — missing auth tag');
  }

  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Compute SHA-256 hash of a plaintext code for deduplication.
 * Code is trimmed and uppercased before hashing.
 *
 * @param plainCode - The plaintext code
 * @returns 32-byte Buffer (SHA-256 digest)
 */
export function hashCode(plainCode: string): Buffer {
  return createHash('sha256').update(plainCode.trim().toUpperCase()).digest();
}

/**
 * Longest single-line value still treated as an ordinary code. Anything longer,
 * or anything spanning lines, is a delivery record rather than a code.
 */
const MASK_INLINE_MAX = 64;

/**
 * Mask a stored account for display.
 *
 * Short, single-line codes keep the original behaviour byte-for-byte
 * ("ABCD-EFGH-IJKL-MNOP" → "****-****-****-MNOP"), because that output is part
 * of the contract the admin screens and the seeded fixtures already expect.
 *
 * Everything else gets a structural summary and NO content at all. The old rule
 * masked every dash-separated segment except the last, which is safe for a
 * fixed-format code and catastrophic for a real account record: stocked
 * accounts are pasted as a multi-line block (credential, expiry, terms,
 * contact line, signature) and the "last segment after the final dash" in that
 * block is the entire terms text. The masked list is gated on `inventory:read`
 * — deliberately weaker than the super-admin-only `inventory:reveal` — precisely
 * so catalogue managers can paste accounts without being able to read them
 * back, and that separation was being voided by this one function.
 */
export function maskCode(plainCode: string): string {
  const lines = plainCode.split('\n');
  if (lines.length > 1) {
    // Line count + total length fingerprint the record so staff can still tell
    // two rows apart, without exposing a single character of either.
    return `[บัญชี ${lines.length} บรรทัด · ${plainCode.length} ตัวอักษร]`;
  }
  if (plainCode.length > MASK_INLINE_MAX) {
    return `[บัญชียาว ${plainCode.length} ตัวอักษร]`;
  }

  const parts = plainCode.split('-');
  if (parts.length <= 1) {
    // No dashes — show last 4 chars
    return '*'.repeat(Math.max(0, plainCode.length - 4)) + plainCode.slice(-4);
  }
  return parts
    .map((part, i) => {
      if (i === parts.length - 1) return part;
      return '*'.repeat(part.length);
    })
    .join('-');
}

/**
 * Generate a random encryption key for initial setup.
 * Returns hex-encoded 32-byte key.
 */
export function generateKey(): string {
  return randomBytes(32).toString('hex');
}
