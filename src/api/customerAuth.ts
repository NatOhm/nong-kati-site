/**
 * Customer Auth API — 08-auth.md §4.
 * Registration, login, logout, refresh, magic link.
 * Uses mock data for M9 (Prisma in production).
 */

import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type CustomerAccountStatus = 'active' | 'unverified' | 'blocked' | 'guest' | 'anonymised';

export type CustomerSession = {
  customerId: string;
  email: string;
  fullName: string | null;
  status: CustomerAccountStatus;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  appleLinked: boolean;
  accessToken: string;
  expiresIn: number;
};

// ─── Mock Store ──────────────────────────────────────────

type MockCustomer = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  phoneNumber: string | null;
  status: CustomerAccountStatus;
  emailVerified: boolean;
  hasPassword: boolean;
  marketingOptIn: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

const mockCustomers: MockCustomer[] = [
  {
    id: 'cust-001',
    email: 'kaem@example.com',
    passwordHash: '$2b$12$mockhash...', // bcrypt mock
    fullName: 'แก้ม สีดำ',
    phoneNumber: '0812345678',
    status: 'active',
    emailVerified: true,
    hasPassword: true,
    marketingOptIn: false,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    lastLoginAt: new Date('2026-08-23T09:00:00Z'),
    failedLoginAttempts: 0,
    lockedUntil: null,
  },
];

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
  // Check existing
  const existing = mockCustomers.find(
    (c) => c.email.toLowerCase() === params.email.toLowerCase()
  );
  if (existing) {
    return { success: false, error: 'EMAIL_ALREADY_EXISTS' };
  }

  // Validate email format
  if (!params.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return { success: false, error: 'INVALID_EMAIL' };
  }

  // Validate password strength
  if (params.password.length < 8) {
    return { success: false, error: 'PASSWORD_TOO_SHORT' };
  }

  const newCustomer: MockCustomer = {
    id: `cust_${Date.now()}`,
    email: params.email,
    passwordHash: '$2b$12$mockhash...',
    fullName: params.fullName ?? null,
    phoneNumber: null,
    status: 'unverified',
    emailVerified: false,
    hasPassword: true,
    marketingOptIn: params.marketingOptIn ?? false,
    createdAt: new Date(),
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  mockCustomers.push(newCustomer);

  writeAuditLog({
    actorType: 'customer',
    actorId: newCustomer.id,
    actorEmail: params.email,
    action: 'register',
    tableName: 'store.customers',
    recordId: newCustomer.id,
  });

  return {
    success: true,
    data: { customerId: newCustomer.id, email: params.email },
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
  const customer = mockCustomers.find(
    (c) => c.email.toLowerCase() === params.email.toLowerCase()
  );

  // Generic error — no enumeration
  if (!customer) {
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Account blocked
  if (customer.status === 'blocked') {
    return { success: false, error: 'ACCOUNT_BLOCKED' };
  }

  // Account locked
  if (customer.lockedUntil && customer.lockedUntil > new Date()) {
    const retryAfterMs = customer.lockedUntil.getTime() - Date.now();
    return { success: false, error: 'ACCOUNT_LOCKED', retryAfterMs };
  }

  // Mock password check — accept any password in dev
  const passwordValid = process.env['NODE_ENV'] !== 'production' || params.password === 'Password123!';

  if (!passwordValid) {
    customer.failedLoginAttempts++;

    if (customer.failedLoginAttempts >= 5) {
      customer.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Success
  customer.failedLoginAttempts = 0;
  customer.lockedUntil = null;
  customer.lastLoginAt = new Date();

  const accessToken = `mock_jwt_${customer.id}_${Date.now()}`;

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
      status: customer.status,
      emailVerified: customer.emailVerified,
      hasPassword: customer.hasPassword,
      googleLinked: false,
      appleLinked: false,
      accessToken,
      expiresIn: params.rememberMe ? 30 * 24 * 60 * 60 : 15 * 60, // 30d or 15min
    },
  };
}

/**
 * Logout — revoke session.
 * 08-auth.md §4.1 — POST /auth/logout
 */
export async function logoutCustomer(
  customerId: string
): Promise<{ success: boolean }> {
  writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    actorEmail: '',
    action: 'logout',
    tableName: 'store.customers',
    recordId: customerId,
  });

  return { success: true };
}

/**
 * Get current customer profile.
 */
export async function getCustomerProfile(
  customerId: string
): Promise<{
  id: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  status: CustomerAccountStatus;
  emailVerified: boolean;
  marketingOptIn: boolean;
  createdAt: Date;
} | null> {
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) return null;

  return {
    id: customer.id,
    email: customer.email,
    fullName: customer.fullName,
    phoneNumber: customer.phoneNumber,
    status: customer.status,
    emailVerified: customer.emailVerified,
    marketingOptIn: customer.marketingOptIn,
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
  }
): Promise<{ success: boolean; error?: string }> {
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) return { success: false, error: 'CUSTOMER_NOT_FOUND' };

  if (params.fullName !== undefined) customer.fullName = params.fullName;
  if (params.phoneNumber !== undefined) customer.phoneNumber = params.phoneNumber;
  if (params.marketingOptIn !== undefined) customer.marketingOptIn = params.marketingOptIn;

  return { success: true };
}
