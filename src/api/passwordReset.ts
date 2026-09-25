/**
 * Password reset API — the real "ลืมรหัสผ่าน?" flow (docs audit #9: the
 * login form used to point the recovery link at the passwordless magic
 * link instead of an actual reset).
 *
 * Flow: customer submits email → a single-use token (32 random bytes,
 * stored ONLY as a SHA-256 hash, 30-minute expiry) is bound to the
 * account and the raw link is emailed. Opening the link lets them set a
 * new password; the token is claimed atomically (guarded updateMany on
 * usedAt = null) inside the same transaction that writes the new scrypt
 * hash and bumps Customer.sessionsInvalidBefore so every JWT issued
 * before the reset stops resolving (stolen-session recovery).
 *
 * Security notes (mirrors src/api/magicLink.ts):
 * - Request responses are identical whether or not the account exists or
 *   has a password at all (OAuth-only accounts get the same answer) — no
 *   enumeration; the token row for other addresses simply expires unused.
 * - Rate limiting lives at the route level (per-email + per-IP).
 * - Blocked accounts: their request yields a dead link rather than an
 *   error at request time (no enumeration); consumption re-checks status.
 * - Same MIN_PASSWORD_LENGTH as register/login (8).
 */

import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { writeAuditLog } from '@/lib/auditLog';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MIN_PASSWORD_LENGTH = 8; // same rule as register/login
const MAX_TOKENS_PER_CUSTOMER = 5; // opportunistic sweep keeps the table small

export type ResetRequestResult =
  | { ok: true; token: string; expiresAt: Date; accountExists: boolean }
  | { ok: false; error: 'INVALID_EMAIL' };

export type ResetConsumeResult =
  | { ok: true; customerId: string; email: string }
  | { ok: false; error: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'ACCOUNT_BLOCKED' };

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Create a reset token bound to the email's account and return the RAW
 * token (the caller builds the URL and emails it — the raw value is never
 * persisted). Unknown addresses, blocked accounts and accounts without a
 * password (OAuth-only) get a real row + ok:true so the HTTP response is
 * identical, but accountExists=false tells the route to skip the email.
 */
export async function createPasswordResetToken(params: {
  email: string;
  ipAddress?: string | null;
}): Promise<ResetRequestResult> {
  const email = params.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'INVALID_EMAIL' };
  }

  // Opportunistic cleanup: drop expired rows and yesterday's history.
  const cutoff = new Date(Date.now() - RESET_TTL_MS);
  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, status: true, passwordHash: true },
  });
  const accountExists = Boolean(customer && customer.status !== 'blocked' && customer.passwordHash);

  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  if (customer) {
    // Bound to the account; for non-resettable accounts the row simply
    // expires unused (consumption re-checks status + passwordHash).
    await prisma.passwordResetToken.create({
      data: {
        customerId: customer.id,
        tokenHash: hashToken(raw),
        expiresAt,
        ipAddress: params.ipAddress ?? null,
      },
    });

    // Keep at most MAX_TOKENS_PER_CUSTOMER rows per account (oldest first).
    const keep = await prisma.passwordResetToken.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_TOKENS_PER_CUSTOMER,
      select: { id: true },
    });
    if (keep.length === MAX_TOKENS_PER_CUSTOMER) {
      await prisma.passwordResetToken.deleteMany({
        where: { customerId: customer.id, id: { notIn: keep.map((r) => r.id) } },
      });
    }
  }

  return { ok: true, token: raw, expiresAt, accountExists };
}

/**
 * Consume a reset token and set the new password — atomically. The token
 * claim (guarded updateMany), the scrypt hash write, the lockout clear and
 * the sessionsInvalidBefore bump commit together or not at all.
 */
export async function resetPasswordWithToken(params: {
  rawToken: string;
  newPassword: string;
  ipAddress?: string | null;
}): Promise<ResetConsumeResult> {
  const newPassword = params.newPassword ?? '';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const tokenHash = hashToken(params.rawToken);
  const now = new Date();

  // Atomic single-use claim — concurrent submits resolve to one winner.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, attemptedAt: now },
  });
  if (claimed.count === 0) {
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) return { ok: false, error: 'INVALID_TOKEN' };
    if (row.usedAt) return { ok: false, error: 'TOKEN_USED' };
    return { ok: false, error: 'TOKEN_EXPIRED' };
  }

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row) return { ok: false, error: 'INVALID_TOKEN' };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: row.customerId } });
      if (!customer || customer.status === 'blocked' || !customer.passwordHash) {
        return { blocked: true as const };
      }

      const passwordHash = await hashPassword(newPassword);
      const updated = await tx.customer.update({
        where: { id: customer.id },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          // Revoke every customer JWT minted before this reset — a stolen
          // session dies here even if the attacker keeps the cookie. The
          // 5s slack keeps the session minted in the same second alive.
          sessionsInvalidBefore: new Date(now.getTime() - 5000),
        },
      });

      await tx.passwordResetToken.update({
        where: { tokenHash },
        data: { ipAddress: params.ipAddress ?? row.ipAddress },
      });

      return { blocked: false as const, customer: updated };
    });

    if (result.blocked) return { ok: false, error: 'ACCOUNT_BLOCKED' };

    const customer = result.customer;
    writeAuditLog({
      actorType: 'customer',
      actorId: customer.id,
      actorEmail: customer.email,
      action: 'password_reset_completed',
      tableName: 'store.customers',
      recordId: customer.id,
      ipAddress: params.ipAddress ?? null,
      metadata: { tokenId: row.id },
    });

    return { ok: true, customerId: customer.id, email: customer.email };
  } catch (err) {
    // Release the claim so the customer may retry with the same link.
    await prisma.passwordResetToken
      .updateMany({
        where: { tokenHash, usedAt: now },
        data: { usedAt: null },
      })
      .catch(() => undefined);
    throw err;
  }
}

/** Diagnostic helper for the request API: is the password even correct? */
export async function verifyCustomerPassword(params: {
  customerId: string;
  password: string;
}): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
    select: { passwordHash: true },
  });
  if (!customer?.passwordHash) return false;
  return verifyPassword(params.password, customer.passwordHash);
}

/** Build the absolute URL the email contains. */
export function passwordResetUrl(rawToken: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/account/reset-password?token=${encodeURIComponent(rawToken)}`;
}
