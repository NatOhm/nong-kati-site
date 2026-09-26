/**
 * Phone (SMS OTP) sign-in API — passwordless login by Thai mobile number.
 *
 * Flow: the customer submits their number → a single-use 6-digit code is
 * stored ONLY as a SHA-256 hash (bound to the number) with a 5-minute expiry
 * and delivered by SMS. Verifying the code consumes it atomically (guarded
 * updateMany — exactly one winner under concurrency) and issues the same
 * JWT session as password / OAuth / magic-link sign-in.
 *
 * Security notes (mirror of magicLink.ts):
 * - Request responses are identical whether or not the number has an account
 *   (no enumeration); SMS delivery failures do not leak that either.
 * - Rate limited 3 codes / 15 min per number at the route level; verify is
 *   additionally capped at 5 attempts per code.
 * - Successful verification sets phoneVerified — receiving the SMS IS proof
 *   of control of the number.
 * - Login key is phoneNumber: an account is found only when the profile
 *   stores the same normalized E.164 number (editable in /account/settings).
 *   Otherwise a new account is created with a placeholder email that the
 *   customer replaces in settings — the placeholder is unreachable for
 *   password resets and never matches a real mailbox.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { signJwt } from '@/lib/jwt';
import { writeAuditLog } from '@/lib/auditLog';
import type { CustomerAccountStatus } from '@/api/customerAuth';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
export const ACCESS_TTL_SHORT = 15 * 60; // same session TTL as password login
export const PLACEHOLDER_EMAIL_DOMAIN = 'phone.local.nong-kati.co.th';

const CODE_RE = /^\d{6}$/;

export type PhoneOtpRequestResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; error: 'INVALID_PHONE' | 'ACCOUNT_BLOCKED' };

export type PhoneOtpVerifyResult =
  | {
      ok: true;
      session: {
        customerId: string;
        email: string;
        fullName: string | null;
        status: CustomerAccountStatus;
        emailVerified: boolean;
        accessToken: string;
        expiresIn: number;
        isNewAccount: boolean;
      };
    }
  | {
      ok: false;
      error:
        | 'INVALID_CODE'
        | 'CODE_EXPIRED'
        | 'CODE_USED'
        | 'TOO_MANY_ATTEMPTS'
        | 'ACCOUNT_BLOCKED';
    };

function hashCode(destinationPhone: string, code: string): string {
  return createHash('sha256').update(`${destinationPhone}:${code}`).digest('hex');
}

/**
 * Normalize a Thai mobile number to E.164 (+66…). Accepts the common local
 * formats: 08X-XXX-XXXX, +668XXXXXXXX, 8XXXXXXXX, with spaces/dashes/dots.
 * Thai mobiles start 6/8/9 after the country code (0 is dropped).
 */
export function normalizeThaiPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  let national: string | null = null;
  if (/^\+66\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^66\d{9}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^[1-9]\d{8}$/.test(digits)) national = digits;
  if (!national || !/^[689]/.test(national)) return null;
  return `+66${national}`;
}

/** Mask a number for logs/audit: +6681234****. */
function maskPhone(phone: string): string {
  return phone.length >= 8 ? `${phone.slice(0, 7)}****` : '****';
}

/** Placeholder email for phone-only accounts (unique per number). */
export function placeholderEmail(phone: string): string {
  return `${phone.replace(/[^0-9]/g, '')}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/**
 * Create an OTP for a phone number and return it (the caller sends the SMS —
 * the raw code is never persisted). A row is always created for a valid
 * number so timing/behaviour stays uniform.
 */
export async function createPhoneOtp(params: {
  phoneE164: string;
  ipAddress?: string | null;
}): Promise<{ ok: true; code: string; expiresAt: Date } | { ok: false; error: 'ACCOUNT_BLOCKED' }> {
  const phone = params.phoneE164;

  // Opportunistic cleanup: expired rows and anything older than 24h.
  const cutoff = new Date(Date.now() - OTP_TTL_MS);
  await prisma.phoneOtpToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  const existing = await prisma.customer.findFirst({ where: { phoneNumber: phone } });
  if (existing?.status === 'blocked') {
    return { ok: false, error: 'ACCOUNT_BLOCKED' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const now = new Date();

  // Audit [High]: issuing a new code invalidates previous challenges for the
  // number — only the newest code can ever verify.
  await prisma.phoneOtpToken.updateMany({
    where: { destinationPhone: phone, usedAt: null },
    data: { usedAt: now },
  });

  await prisma.phoneOtpToken.create({
    data: {
      destinationPhone: phone,
      codeHash: hashCode(phone, code),
      expiresAt,
      ipAddress: params.ipAddress ?? null,
    },
  });

  return { ok: true, code, expiresAt };
}

/**
 * Verify a submitted code: single-use, expiry-checked, max 5 attempts,
 * atomically claimed via a guarded updateMany. On success finds or creates
 * the customer by phoneNumber and mints the standard customer JWT session
 * (same shape as password/OAuth/magic-link login).
 */
export async function verifyPhoneOtp(params: {
  phoneE164: string;
  code: string;
  ipAddress?: string | null;
}): Promise<PhoneOtpVerifyResult> {
  const phone = params.phoneE164;
  const code = params.code.trim();

  if (!CODE_RE.test(code)) return { ok: false, error: 'INVALID_CODE' };

  const now = new Date();

  // Audit [High]: locate the ACTIVE challenge by number, not by candidate
  // hash. Looking the token up by codeHash made wrong guesses invisible
  // (no row → no attempt counted → unlimited guessing) and made the
  // codeHash comparison branch unreachable. findFirst on the newest
  // unclaimed challenge fixes both; the stored hash is compared
  // constant-time below.
  const row = await prisma.phoneOtpToken.findFirst({
    where: { destinationPhone: phone, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return { ok: false, error: 'INVALID_CODE' };

  // Attempt cap: the 6th verify attempt against this challenge is refused
  // even if the code would be correct (re-request a new one).
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
  }

  if (row.expiresAt <= now) return { ok: false, error: 'CODE_EXPIRED' };

  // Constant-time comparison of the candidate against the stored hash.
  const candidateHash = Buffer.from(hashCode(phone, code), 'hex');
  const storedHash = Buffer.from(row.codeHash, 'hex');
  const codeMatches =
    candidateHash.length === storedHash.length && timingSafeEqual(candidateHash, storedHash);

  // Count EVERY verify attempt against the challenge (wrong guesses burn
  // the allowance too), then claim single-use atomically when correct.
  // CAS-with-increment (review 2026-09-26): the where-clause pins the
  // previously observed attempts value, so two simultaneous guesses each
  // move the counter exactly once; the loser retries with fresh state.
  for (;;) {
    const bumped = await prisma.phoneOtpToken.updateMany({
      where: { id: row.id, usedAt: null, attempts: row.attempts },
      data: { attemptedAt: now, attempts: { increment: 1 } },
    });
    if (bumped.count === 0) {
      // Another concurrent verify won the race — reload once and re-decide.
      const fresh = await prisma.phoneOtpToken.findUnique({ where: { id: row.id } });
      if (!fresh || fresh.usedAt) return { ok: false, error: 'CODE_USED' };
      if (fresh.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
      return { ok: false, error: 'INVALID_CODE' };
    }
    const attemptCount = row.attempts + 1;
    if (!codeMatches) {
      return {
        ok: false,
        error: attemptCount >= MAX_ATTEMPTS ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE',
      };
    }

    const claimed = await prisma.phoneOtpToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 1) break;
    return { ok: false, error: 'CODE_USED' };
  }

  // Find or create the customer by phone number.
  let customer = await prisma.customer.findFirst({ where: { phoneNumber: phone } });
  const isNewAccount = !customer;

  if (customer?.status === 'blocked') {
    return { ok: false, error: 'ACCOUNT_BLOCKED' };
  }

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        email: placeholderEmail(phone),
        passwordHash: null,
        phoneNumber: phone,
        phoneVerified: true,
        status: 'active',
      },
    });
  }

  const accessToken = await signJwt(
    { sub: customer.id, email: customer.email, typ: 'customer' },
    ACCESS_TTL_SHORT,
  );

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      lastLoginAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      phoneVerified: true,
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: customer.id,
    actorEmail: customer.email,
    action: 'login_phone_otp',
    tableName: 'Customer',
    recordId: customer.id,
    ipAddress: params.ipAddress ?? null,
    metadata: { phone: maskPhone(phone), created: isNewAccount },
  });

  return {
    ok: true,
    session: {
      customerId: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      status: customer.status as CustomerAccountStatus,
      emailVerified: customer.emailVerified,
      accessToken,
      expiresIn: ACCESS_TTL_SHORT,
      isNewAccount,
    },
  };
}
