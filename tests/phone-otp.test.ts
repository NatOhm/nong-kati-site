/**
 * Unit tests for phone (SMS OTP) sign-in — pure logic only (no DB, no
 * network) so CI can run them without services. Run: npm test
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    phoneOtpToken: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('@/lib/jwt', () => ({
  signJwt: vi.fn().mockResolvedValue('jwt-token'),
}));

process.env['NK_JWT_SECRET'] = 'unit-test-secret';

const { prisma } = await import('@/lib/db');
const { createPhoneOtp, normalizeThaiPhone, placeholderEmail, verifyPhoneOtp } = await import(
  '@/api/phoneOtp'
);
const { isSmsConfigured, sendOtpSms } = await import('@/lib/sms/otpSms');

function codeHashFor(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.phoneOtpToken.updateMany).mockResolvedValue({ count: 1 });
});

describe('normalizeThaiPhone', () => {
  it('normalizes common Thai mobile formats to E.164', () => {
    expect(normalizeThaiPhone('0812345678')).toBe('+66812345678');
    expect(normalizeThaiPhone('081-234-5678')).toBe('+66812345678');
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('+66812345678');
    expect(normalizeThaiPhone('66812345678')).toBe('+66812345678');
    expect(normalizeThaiPhone('812345678')).toBe('+66812345678');
    expect(normalizeThaiPhone('0912345678')).toBe('+66912345678');
    expect(normalizeThaiPhone('0612345678')).toBe('+66612345678');
  });

  it('rejects landlines and malformed input', () => {
    expect(normalizeThaiPhone('021234567')).toBeNull(); // landline
    expect(normalizeThaiPhone('08123456')).toBeNull(); // too short
    expect(normalizeThaiPhone('08123456789')).toBeNull(); // too long
    expect(normalizeThaiPhone('')).toBeNull();
    expect(normalizeThaiPhone('abc')).toBeNull();
    expect(normalizeThaiPhone('1123456789')).toBeNull(); // not a mobile prefix
  });
});

describe('placeholderEmail', () => {
  it('is unique per number on the unreachable domain', () => {
    expect(placeholderEmail('+66812345678')).toBe('66812345678@phone.local.nong-kati.co.th');
    expect(placeholderEmail('+66912345678')).not.toBe(placeholderEmail('+66812345678'));
  });
});

describe('createPhoneOtp', () => {
  it('creates a 6-digit code bound to the phone hash', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
    const result = await createPhoneOtp({ phoneE164: '+66812345678' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toMatch(/^\d{6}$/);
    expect(prisma.phoneOtpToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        destinationPhone: '+66812345678',
        codeHash: codeHashFor('+66812345678', result.code),
      }),
    });
  });

  it('refuses blocked accounts', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ status: 'blocked' } as never);
    const result = await createPhoneOtp({ phoneE164: '+66812345678' });
    expect(result).toEqual({ ok: false, error: 'ACCOUNT_BLOCKED' });
  });
});

describe('verifyPhoneOtp', () => {
  const phone = '+66812345678';
  const code = '123456';

  function mockRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'otp-1',
      destinationPhone: phone,
      codeHash: codeHashFor(phone, code),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      attemptedAt: null,
      attempts: 0,
      ipAddress: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('rejects malformed codes without touching the DB', async () => {
    const result = await verifyPhoneOtp({ phoneE164: phone, code: '12ab' });
    expect(result).toEqual({ ok: false, error: 'INVALID_CODE' });
    expect(prisma.phoneOtpToken.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when the number has no active challenge', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(null as never);
    expect(await verifyPhoneOtp({ phoneE164: phone, code })).toEqual({
      ok: false,
      error: 'INVALID_CODE',
    });
  });

  it('locates the active challenge by NUMBER, not candidate hash (audit [High])', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    await verifyPhoneOtp({ phoneE164: phone, code });
    expect(prisma.phoneOtpToken.findFirst).toHaveBeenCalledWith({
      where: { destinationPhone: phone, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects wrong codes and counts the attempt against the challenge', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    const result = await verifyPhoneOtp({ phoneE164: phone, code: '654321' });
    expect(result).toEqual({ ok: false, error: 'INVALID_CODE' });
    expect(prisma.phoneOtpToken.update).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: expect.objectContaining({ attempts: 1 }),
    });
  });

  it('counts five distinct wrong codes → the 6th attempt (even correct) is refused', async () => {
    // The audit's core scenario: attempts must accumulate on ONE challenge.
    for (let attempts = 0; attempts < 5; attempts++) {
      vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow({ attempts }) as never);
      const wrong = await verifyPhoneOtp({
        phoneE164: phone,
        code: '00000'.replace('0', String(attempts)) + '00',
      });
      expect(wrong).toEqual({ ok: false, error: 'INVALID_CODE' });
    }
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow({ attempts: 5 }) as never);
    const sixth = await verifyPhoneOtp({ phoneE164: phone, code }); // even correct
    expect(sixth).toEqual({ ok: false, error: 'TOO_MANY_ATTEMPTS' });
  });

  it('rejects expired challenges by expiry, not by absence', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(
      mockRow({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );
    const result = await verifyPhoneOtp({ phoneE164: phone, code });
    expect(result).toEqual({ ok: false, error: 'CODE_EXPIRED' });
  });

  it('rejects a challenge consumed concurrently (claimed between reads)', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    vi.mocked(prisma.phoneOtpToken.updateMany).mockResolvedValue({ count: 0 });
    const result = await verifyPhoneOtp({ phoneE164: phone, code });
    expect(result).toEqual({ ok: false, error: 'CODE_USED' });
  });

  it('signs in an existing customer and marks phoneVerified', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: 'c_1',
      email: 'real@mail.com',
      fullName: 'Tester',
      status: 'active',
      emailVerified: true,
    } as never);
    vi.mocked(prisma.phoneOtpToken.updateMany).mockResolvedValue({ count: 1 });

    const result = await verifyPhoneOtp({ phoneE164: phone, code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.customerId).toBe('c_1');
    expect(result.session.isNewAccount).toBe(false);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c_1' },
      data: expect.objectContaining({ phoneVerified: true, lastLoginAt: expect.any(Date) }),
    });
  });

  it('creates a phone-only account with a placeholder email when none matches', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.customer.create).mockResolvedValue({
      id: 'c_new',
      email: placeholderEmail(phone),
      fullName: null,
      status: 'active',
      emailVerified: false,
    } as never);

    const result = await verifyPhoneOtp({ phoneE164: phone, code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.isNewAccount).toBe(true);
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: placeholderEmail(phone),
        phoneNumber: phone,
        phoneVerified: true,
        passwordHash: null,
      }),
    });
  });

  it('refuses blocked accounts at verification', async () => {
    vi.mocked(prisma.phoneOtpToken.findFirst).mockResolvedValue(mockRow() as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ status: 'blocked' } as never);
    const result = await verifyPhoneOtp({ phoneE164: phone, code });
    expect(result).toEqual({ ok: false, error: 'ACCOUNT_BLOCKED' });
  });
});

describe('SMS delivery helpers', () => {
  it('isSmsConfigured: dev mode wins, otherwise all Twilio vars are required', () => {
    process.env['NK_OTP_DEV_MODE'] = '1';
    expect(isSmsConfigured()).toBe(true);
    process.env['NK_OTP_DEV_MODE'] = '';
    expect(isSmsConfigured()).toBe(false);
    process.env['NK_TWILIO_ACCOUNT_SID'] = 'ACxxx';
    process.env['NK_TWILIO_AUTH_TOKEN'] = 'tok';
    expect(isSmsConfigured()).toBe(false); // still missing FROM number
    process.env['NK_TWILIO_FROM_NUMBER'] = '+66800000000';
    expect(isSmsConfigured()).toBe(true);
    delete process.env['NK_TWILIO_ACCOUNT_SID'];
    delete process.env['NK_TWILIO_AUTH_TOKEN'];
    delete process.env['NK_TWILIO_FROM_NUMBER'];
  });

  it('sendOtpSms: dev mode logs and succeeds without network', async () => {
    process.env['NK_OTP_DEV_MODE'] = '1';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(sendOtpSms({ to: '+66812345678', code: '123456' })).resolves.toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
    log.mockRestore();
    process.env['NK_OTP_DEV_MODE'] = '';
  });

  it('sendOtpSms: false when Twilio is not configured (no dev mode)', async () => {
    await expect(sendOtpSms({ to: '+66812345678', code: '123456' })).resolves.toBe(false);
  });
});
