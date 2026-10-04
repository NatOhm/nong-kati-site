/**
 * Generate 2FA backup codes for an admin account.
 *
 * Usage: npx tsx scripts/generate-backup-codes.ts <email>
 *
 * Calls the app's OWN storeBackupCodes() rather than writing rows directly,
 * so normalization + SHA-256 hashing + replace-any semantics are identical to
 * the enrollment path (audit #9). The TOTP secret is NOT touched: this is the
 * recovery path for an account that is already enrolled, which is exactly the
 * case setup2fa() refuses with ALREADY_ENROLLED.
 *
 * The plaintext codes are returned ONCE, here. Only hashes are stored.
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
}

import { PrismaClient } from '@prisma/client';
import { storeBackupCodes, countUnusedBackupCodes } from '../src/api/adminAuth';

const p = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/generate-backup-codes.ts <email>');
    process.exit(2);
  }

  const user = await p.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true, totpSecret: true, totpConfirmed: true },
  });
  if (!user) {
    console.error('No such admin account:', email);
    process.exit(1);
  }
  const secretBefore = user.totpSecret;

  const before = await countUnusedBackupCodes(user.id);
  const codes = await storeBackupCodes(user.id);
  const after = await countUnusedBackupCodes(user.id);

  const after2 = await p.adminUser.findUnique({
    where: { email },
    select: { totpSecret: true },
  });

  // Prove only hashes are persisted — never plaintext.
  const rows = await p.adminBackupCode.findMany({ where: { adminUserId: user.id } });
  const plaintextLeaked = rows.filter(
    (r) => codes.some((c) => c.replace('-', '') === r.codeHash || c === r.codeHash),
  );

  console.log('--- backup codes generated ---');
  console.log('account       :', user.email, `(${user.fullName})`);
  console.log('unused before :', before, '-> after:', after);
  console.log('rows stored   :', rows.length, '| all usedAt null:', rows.every((r) => r.usedAt === null));
  console.log(
    'hash shape    :',
    rows.every((r) => /^[0-9a-f]{64}$/.test(r.codeHash)) ? 'all 64-char hex' : 'UNEXPECTED',
  );
  console.log('plaintext leak:', plaintextLeaked.length === 0 ? 'none (correct)' : 'PLAINTEXT FOUND');
  console.log(
    'totp untouched:',
    after2?.totpSecret === secretBefore ? 'yes (identical)' : 'NO — SECRET CHANGED',
  );
  console.log('codes         :', codes.join('  '));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});