/**
 * Magic Link sign-in API — passwordless email login.
 *
 * Flow: the customer submits their email → a single-use token (32 random
 * bytes) is stored ONLY as a SHA-256 hash with a 15-minute expiry and the
 * raw link is emailed to them. Opening the link consumes the token
 * atomically (updateMany guarded on usedAt = null) and issues the same
 * JWT session the password login issues.
 *
 * Security notes:
 * - Request responses are identical whether or not the account exists
 *   (no enumeration); email delivery failures do not leak that either.
 * - Rate limited 3 requests / 15 min per email at the route level.
 * - The token binds to the customer implicitly: consumption re-checks the
 *   account is still active and not blocked before minting a session.
 * - Blocked accounts are rejected at consumption (their request yields a
 *   dead link rather than an error at request time — no enumeration).
 * - Consuming a token marks emailVerified for that account: clicking a
 *   link delivered to the mailbox IS proof of mailbox control. OAuth
 *   sign-in makes the same trust decision.
 */

import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db';
import { signJwt } from '@/lib/jwt';
import { normalizeTier } from '@/lib/pricing';
import { writeAuditLog } from '@/lib/auditLog';
import type { CustomerAccountStatus } from '@/api/customerAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_TOKENS_PER_EMAIL = 5; // opportunistic sweep keeps the table small
export const ACCESS_TTL_SHORT = 15 * 60; // same session TTL as password login

export type MagicLinkRequestResult =
  | { ok: true; token: string; expiresAt: Date; accountExists: boolean }
  | { ok: false; error: 'INVALID_EMAIL' | 'ACCOUNT_BLOCKED' };

export type MagicLinkConsumeResult =
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
      };
    }
  | { ok: false; error: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'ACCOUNT_BLOCKED' };

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Create a magic link token for an email and return the RAW token (the
 * caller builds the URL and emails it — the raw value is never persisted).
 * A row is created for unknown addresses too (uniform behaviour), but the
 * result now reports whether the account exists so the ROUTE can skip the
 * outbound email — the HTTP response stays identical either way, while the
 * sender is no longer a free relay for arbitrary recipient lists (review
 * Medium: rotating unknown addresses used to reach the real mailbox).
 */
export async function createMagicLinkToken(params: {
  email: string;
  ipAddress?: string | null;
}): Promise<MagicLinkRequestResult> {
  const email = params.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'INVALID_EMAIL' };
  }

  // Opportunistic cleanup: drop expired rows and cap per-email history.
  const cutoff = new Date(Date.now() - TOKEN_TTL_MS);
  await prisma.magicLinkToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash: hashToken(raw),
      expiresAt,
      ipAddress: params.ipAddress ?? null,
    },
  });

  // Deliverability decision (not an enumeration signal — the response does
  // not change): only real, active accounts enqueue outbound mail.
  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { status: true },
  });
  const accountExists = Boolean(customer && customer.status !== 'blocked');

  // Keep at most MAX_TOKENS_PER_EMAIL rows per address (oldest first).
  const keep = await prisma.magicLinkToken.findMany({
    where: { email },
    orderBy: { createdAt: 'desc' },
    take: MAX_TOKENS_PER_EMAIL,
    select: { id: true },
  });
  if (keep.length === MAX_TOKENS_PER_EMAIL) {
    await prisma.magicLinkToken.deleteMany({
      where: { email, id: { notIn: keep.map((r) => r.id) } },
    });
  }

  return { ok: true, token: raw, expiresAt, accountExists };
}

/**
 * Consume a magic link token: single-use, expiry-checked, atomically
 * claimed via a guarded updateMany. On success mints the standard customer
 * JWT session (same shape as password/OAuth login).
 */
export async function consumeMagicLinkToken(params: {
  rawToken: string;
  ipAddress?: string | null;
}): Promise<MagicLinkConsumeResult> {
  const tokenHash = hashToken(params.rawToken);
  const now = new Date();

  // Atomic single-use claim: updateMany only matches unclaimed, unexpired
  // rows — concurrent clicks resolve to exactly one winner.
  const claimed = await prisma.magicLinkToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, attemptedAt: now },
  });
  if (claimed.count === 0) {
    // Distinguish the failure reason for the UI (used vs expired vs unknown).
    const row = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    if (!row) return { ok: false, error: 'INVALID_TOKEN' };
    if (row.usedAt) return { ok: false, error: 'TOKEN_USED' };
    return { ok: false, error: 'TOKEN_EXPIRED' };
  }

  const row = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!row) return { ok: false, error: 'INVALID_TOKEN' };

  const customer = await prisma.customer.findUnique({ where: { email: row.email } });
  if (!customer || customer.status === 'blocked') {
    await prisma.magicLinkToken.update({
      where: { tokenHash },
      data: { attemptedAt: now, ipAddress: params.ipAddress ?? row.ipAddress },
    });
    return { ok: false, error: customer ? 'ACCOUNT_BLOCKED' : 'INVALID_TOKEN' };
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
      emailVerified: true,
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: customer.id,
    actorEmail: customer.email,
    action: 'login_magic_link',
    tableName: 'store.customers',
    recordId: customer.id,
    ipAddress: params.ipAddress ?? null,
    metadata: { tokenId: row.id },
  });

  return {
    ok: true,
    session: {
      customerId: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      status: customer.status as CustomerAccountStatus,
      emailVerified: true,
      accessToken,
      expiresIn: ACCESS_TTL_SHORT,
    },
  };
}

/** Build the absolute URL the email contains. */
export function magicLinkUrl(rawToken: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/account/magic-link?token=${encodeURIComponent(rawToken)}`;
}

/** Tier helper re-exported for the session shape parity. */
export { normalizeTier };
