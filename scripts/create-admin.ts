/**
 * Explicit admin bootstrap (security review C1).
 * Replaces the removed login-path seeding: provisioning an administrator is
 * now an operational command an operator runs deliberately — a request-path
 * default can never create privileged rows again.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> "<Full Name>" <role> [password] [--rotate]
 *
 *   role      super_admin | catalogue_manager | order_manager | finance_viewer | support_agent
 *   password  optional; a strong random one is generated when omitted
 *   --rotate  if the account already exists, replace its password + TOTP
 *             secret and invalidate all its sessions (rotation flow)
 *
 * Safety rails:
 * - Refuses the retired default passwords (admin123 / catalogue123 / orders123).
 * - Minimum 12 characters when a password is supplied.
 * - Always generates a FRESH unique TOTP secret (never a shared seed).
 * - Refuses to touch an existing account without --rotate.
 * Loads .env.local itself (same pattern as the other scripts in this folder).
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
}

import { hashPassword } from '../src/lib/password';
import { generateTotpSecret } from '../src/lib/jwt';

const FORBIDDEN = ['admin123', 'catalogue123', 'orders123', 'JBSWY3DPEHPK3PXP'];
const ROLES = [
  'super_admin',
  'catalogue_manager',
  'order_manager',
  'finance_viewer',
  'support_agent',
] as const;

const p = new PrismaClient();

function strongPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length]!;
  return out;
}

async function main(): Promise<void> {
  const [email, fullName, role, password, rotateFlag] = process.argv.slice(2);
  const rotate = rotateFlag === '--rotate';
  if (!email || !fullName || !role) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts <email> "<Full Name>" <role> [password] [--rotate]',
    );
    process.exit(2);
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    console.error('Unknown role:', role, '\nValid roles:', ROLES.join(', '));
    process.exit(2);
  }
  if (FORBIDDEN.includes(password ?? '')) {
    console.error('Refusing a retired default password — choose a strong one or omit the argument.');
    process.exit(2);
  }
  if (password && password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(2);
  }
  if (process.env.NODE_ENV === 'production' && !rotate) {
    // Fail closed: production provisioning is deliberate, not accidental.
    console.error('NODE_ENV=production: pass --rotate to confirm provisioning against production.');
    process.exit(2);
  }

  const pw = password ?? strongPassword();
  const secret = generateTotpSecret();
  const existing = await p.adminUser.findUnique({ where: { email } });

  if (existing && !rotate) {
    console.error('Account already exists. Pass --rotate to replace its password + TOTP secret.');
    process.exit(1);
  }

  const data = {
    fullName,
    role: role as (typeof ROLES)[number],
    status: 'active' as const,
    passwordHash: await hashPassword(pw),
    totpSecret: secret,
    totpConfirmed: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    sessionsInvalidBefore: new Date(),
  };

  const admin =
    existing === null
      ? await p.adminUser.create({ data: { ...data, email } })
      : await p.adminUser.update({ where: { email }, data });

  const uri = `otpauth://totp/Nong-Kati%3A${encodeURIComponent(admin.email)}?secret=${secret}&issuer=Nong-Kati`;
  console.log('--- admin provisioned/rotated ---');
  console.log('email       :', admin.email);
  console.log('password    :', pw);
  console.log('totp secret :', secret, '(add to authenticator: manual entry or the URI below)');
  console.log('otpauth uri :', uri);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
