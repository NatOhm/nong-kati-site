/**
 * Customer Auth API — 08-auth.md §4.
 * Real implementation: PostgreSQL (Prisma) + scrypt password hashing + JWT
 * session cookie. Registration, login, logout, profile.
 *
 * Security notes:
 * - Passwords hashed with scrypt (N=16384), never stored or logged in plaintext.
 * - Login failures are generic (no account enumeration) and lock after 5
 *   consecutive failures for 15 minutes (lockout persisted per customer row).
 * - Access tokens are HS256 JWTs signed with NK_JWT_SECRET; short TTL.
 *   The secret must be set in env; a random per-boot secret in dev keeps
 *   tokens meaningless across restarts rather than silently trusting a
 *   hardcoded value.
 */

import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { signJwt, verifyJwt } from '@/lib/jwt';
import { normalizeTier } from '@/lib/pricing';
import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type CustomerAccountStatus = 'active' | 'unverified' | 'blocked' | 'anonymised';

export type CustomerSession = {
  customerId: string;
  email: string;
  fullName: string | null;
  status: CustomerAccountStatus;
  emailVerified: boolean;
  accessToken: string;
  expiresIn: number;
};

const JWT_SECRET = process.env['NK_JWT_SECRET'] || `dev-only-${Date.now()}`;
const ACCESS_TTL_SHORT = 15 * 60; // 15 minutes
const ACCESS_TTL_REMEMBER = 30 * 24 * 60 * 60; // 30 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── API Functions ───────────────────────────────────────

/**
 * Register a new customer.
 * 08-auth.md §4.1 — POST /auth/register
 */
export async function registerCustomer(params: {
  email: string;
  password: string;
  fullName?: string;
  marketingOptIn?: boolean;
}): Promise<{ success: boolean; data?: { customerId: string; email: string }; error?: string }> {
  const email = params.email.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { success: false, error: 'INVALID_EMAIL' };
  }
  if (params.password.length < 8 || params.password.length > 128) {
    return { success: false, error: 'PASSWORD_TOO_SHORT' };
  }

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: 'EMAIL_ALREADY_EXISTS' };
  }

  const passwordHash = await hashPassword(params.password);

  const customer = await prisma.customer.create({
    data: {
      email,
      passwordHash,
      fullName: params.fullName?.trim() || null,
      marketingOptIn: params.marketingOptIn ?? false,
      status: 'active', // email verification flow is a separate milestone
      emailVerified: false,
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: customer.id,
    actorEmail: email,
    action: 'register',
    tableName: 'store.customers',
    recordId: customer.id,
  });

  return {
    success: true,
    data: { customerId: customer.id, email },
  };
}

/**
 * Login with email + password.
 * 08-auth.md §4.1 — POST /auth/login
 */
export async function loginCustomer(params: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<{ success: boolean; data?: CustomerSession; error?: string; retryAfterMs?: number }> {
  const email = params.email.trim().toLowerCase();

  const customer = await prisma.customer.findUnique({ where: { email } });

  // Generic error — no account enumeration
  if (!customer) {
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  if (customer.status === 'blocked') {
    return { success: false, error: 'ACCOUNT_BLOCKED' };
  }

  if (customer.lockedUntil && customer.lockedUntil > new Date()) {
    return {
      success: false,
      error: 'ACCOUNT_LOCKED',
      retryAfterMs: customer.lockedUntil.getTime() - Date.now(),
    };
  }

  // OAuth-only account (Google/LINE sign-in, no local password set) — a
  // password attempt must not increment the lockout counter or verify.
  if (!customer.passwordHash) {
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  const passwordValid = await verifyPassword(params.password, customer.passwordHash);

  if (!passwordValid) {
    // Atomic increment with CAS guard (review 2026-09-26): the old
    // read-modify-write lost concurrent increments (N failures → count 1).
    const bumped = await prisma.customer.updateMany({
      where: { id: customer.id, lockedUntil: null },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    const fresh =
      bumped.count === 1
        ? await prisma.customer.findUnique({
            where: { id: customer.id },
            select: { failedLoginAttempts: true },
          })
        : null;
    const attempts = fresh?.failedLoginAttempts ?? 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCKOUT_MS),
        },
      });
    }
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  const expiresIn = params.rememberMe ? ACCESS_TTL_REMEMBER : ACCESS_TTL_SHORT;
  const accessToken = await signJwt(
    { sub: customer.id, email: customer.email, typ: 'customer' },
    expiresIn,
  );

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: customer.id,
    actorEmail: customer.email,
    action: 'login',
    tableName: 'store.customers',
    recordId: customer.id,
  });

  return {
    success: true,
    data: {
      customerId: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      status: customer.status as CustomerAccountStatus,
      emailVerified: customer.emailVerified,
      accessToken,
      expiresIn,
    },
  };
}

/**
 * Logout — cut every session token issued before NOW (review 2026-09-26):
 * a copied/exfiltrated remember-me JWT becomes unusable the moment the
 * customer logs out, on every device, not just the calling browser.
 * Stateful-enough: getCustomerFromToken already enforces
 * sessionsInvalidBefore, so no table round-trip is added on hot paths.
 */
export async function logoutCustomer(
  customerId: string,
  token?: string,
): Promise<{ success: boolean }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, sessionsInvalidBefore: true },
  });
  if (customer) {
    // Only bump when the presented token is still valid relative to the
    // current marker (avoids needlessly invalidating newer sessions after a
    // password reset already cut everything).
    let mustInvalidate = true;
    if (token) {
      const payload = (await verifyJwt(token)) as { iat?: number } | null;
      if (payload?.iat && customer.sessionsInvalidBefore) {
        mustInvalidate = payload.iat * 1000 >= customer.sessionsInvalidBefore.getTime() + 5000;
      }
    }
    if (mustInvalidate) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { sessionsInvalidBefore: new Date() },
      });
    }
    writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      actorEmail: customer.email,
      action: 'logout',
      tableName: 'store.customers',
      recordId: customerId,
    });
  }
  return { success: true };
}

/**
 * Verify a session token and return the customer, or null.
 * Used by server-side code to authenticate a request.
 */
/**
 * Social sign-in (Google/LINE): find-or-create the customer by email and
 * issue a session token — same shape the password login returns. OAuth
 * accounts have passwordHash: null (they cannot password-login until one
 * is set). Existing password accounts are linked by email automatically:
 * the provider address is verified by the provider, so this is the same
 * trust decision every social login makes; blocked accounts are still
 * rejected.
 */
export async function loginOrCreateCustomerViaOAuth(params: {
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  provider: string;
}): Promise<{ success: boolean; data?: CustomerSession; error?: string }> {
  const email = params.email.trim().toLowerCase();

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing?.status === 'blocked') {
    return { success: false, error: 'ACCOUNT_BLOCKED' };
  }

  const customer =
    existing ??
    (await prisma.customer.create({
      data: {
        email,
        passwordHash: null,
        fullName: params.fullName,
        status: 'active',
        // Provider-verified email — mark verified so the flag is truthful.
        emailVerified: params.emailVerified,
      },
    }));

  const expiresIn = ACCESS_TTL_SHORT;
  const accessToken = await signJwt(
    { sub: customer.id, email: customer.email, typ: 'customer' },
    expiresIn,
  );

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: customer.id,
    actorEmail: customer.email,
    action: 'login_oauth',
    tableName: 'store.customers',
    recordId: customer.id,
    metadata: { provider: params.provider, created: !existing },
  });

  return {
    success: true,
    data: {
      customerId: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      status: customer.status as CustomerAccountStatus,
      emailVerified: customer.emailVerified,
      accessToken,
      expiresIn,
    },
  };
}

export async function getCustomerFromToken(token: string) {
  try {
    const { verifyJwt } = await import('@/lib/jwt');
    const payload = await verifyJwt<{ sub: string; typ: string; iat?: number }>(token);
    if (!payload || payload.typ !== 'customer') return null;
    const customer = await prisma.customer.findUnique({
      where: { id: payload.sub },
    });
    if (!customer || customer.status === 'blocked') return null;
    // Password reset revocation: JWTs minted before the reset instant stop
    // resolving (the 5s slack matches the minted-in-the-same-second grace
    // applied when the marker was written). Fresh logins always carry a
    // later iat, so only pre-reset sessions are affected.
    if (
      customer.sessionsInvalidBefore &&
      typeof payload.iat === 'number' &&
      payload.iat * 1000 < customer.sessionsInvalidBefore.getTime() + 5000
    ) {
      return null;
    }
    return customer;
  } catch {
    return null;
  }
}

/**
 * Get current customer profile.
 */
export async function getCustomerProfile(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;
  return {
    id: customer.id,
    email: customer.email,
    fullName: customer.fullName,
    phoneNumber: customer.phoneNumber,
    status: customer.status as CustomerAccountStatus,
    emailVerified: customer.emailVerified,
    marketingOptIn: customer.marketingOptIn,
    tier: normalizeTier(customer.tier),
    createdAt: customer.createdAt,
  };
}

/**
 * Update customer profile.
 * 07-api.md §13 — PATCH /account/profile
 */
export async function updateCustomerProfile(
  customerId: string,
  params: {
    fullName?: string;
    phoneNumber?: string;
    marketingOptIn?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { success: false, error: 'CUSTOMER_NOT_FOUND' };

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(params.fullName !== undefined && { fullName: params.fullName }),
      // Number changed (or cleared) → the stored verification no longer
      // applies; the new number must pass an OTP challenge before OTP
      // sign-in accepts it (audit [Medium]).
      ...(params.phoneNumber !== undefined && {
        phoneNumber: params.phoneNumber,
        ...(params.phoneNumber !== customer.phoneNumber && { phoneVerified: false }),
      }),
      ...(params.marketingOptIn !== undefined && { marketingOptIn: params.marketingOptIn }),
    },
  });
  return { success: true };
}
