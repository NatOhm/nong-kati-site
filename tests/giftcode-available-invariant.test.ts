/**
 * The database refuses an `available` GiftCode that belongs to no variant.
 *
 * Production held 13 such rows (found 2026-11-17): they counted as sellable
 * stock, sat in no product row and were sellable by nothing. The application
 * cannot produce them — `catalogPurge` detaches only reserved/delivered codes
 * and deletes the rest, and both purge scripts delete rather than detach — and
 * all 13 carried the same `updatedAt` minute with no purge audit near it, so
 * the cause was a one-off scripted/manual UPDATE that no unit test could catch.
 *
 * Hence the guard lives in the database (migration
 * `20261117093000_giftcode_available_requires_variant`), and this suite proves
 * it by EXECUTION: it applies that migration's own SQL to a throwaway table on
 * a real MariaDB and then tries to violate the rule the four ways that matter.
 *
 * WHAT IT WILL NOT RUN AGAINST: only loopback databases. A `DATABASE_URL`
 * pointing anywhere else (production included) makes this suite SKIP rather
 * than create a table — a test that silently touched the shop would be a worse
 * bug than the one it guards. CI's `mariadb:10.11` service is `127.0.0.1`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20261117093000_giftcode_available_requires_variant',
  'migration.sql',
);

const RAW_URL = process.env['DATABASE_URL'] ?? '';
const LOOPBACK = /^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//i;
const RUNNABLE = LOOPBACK.test(RAW_URL);

/** The probe table the guard is applied to — never the real GiftCode table. */
const PROBE = 'GiftCodeGuardProbe';

const describeDb = RUNNABLE ? describe : describe.skip;

/**
 * DDL through the migration engine, like `prisma migrate deploy` uses:
 * DROP TRIGGER is refused over the prepared-statement protocol (MariaDB 1295),
 * which is what `$executeRaw*` speaks.
 */
const ddl = (sql: string): void => {
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
      'db',
      'execute',
      '--url',
      RAW_URL,
      '--stdin',
    ],
    { input: sql, env: process.env, stdio: 'pipe' },
  );
};

/** Triggers live in the schema, not the table — drop them or the next run collides. */
const dropProbe = (): void => {
  ddl(
    ['ins', 'upd']
      .map((suffix) => `DROP TRIGGER IF EXISTS \`${PROBE}_${suffix}\`;`)
      .concat(`DROP TABLE IF EXISTS \`${PROBE}\`;`)
      .join('\n'),
  );
};

describeDb('GiftCode — available requires a variant (database guard)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
    dropProbe();
    await db.$executeRawUnsafe(`
      CREATE TABLE \`${PROBE}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`variantId\` VARCHAR(191) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'available',
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // The migration's own SQL, retargeted at the probe table. If someone edits
    // the migration to drop a trigger, this suite stops passing.
    const sql = readFileSync(MIGRATION, 'utf8')
      .replaceAll('`GiftCode`', `\`${PROBE}\``)
      // Names too, not just the table: on any database where the migration is
      // already applied — production, a migrated test DB — the real triggers
      // exist and MariaDB refuses a second trigger with the same name.
      .replaceAll('GiftCode_available_requires_variant_', `${PROBE}_`);
    expect(sql).toContain('SIGNAL SQLSTATE');
    // CREATE TRIGGER is refused over the prepared-statement protocol
    // (MariaDB 1295), which is what the client uses for every query — so the
    // DDL goes through the SAME engine `prisma migrate deploy` uses, via
    // `prisma db execute`. Using a client-level workaround here would test a
    // path production never takes.
    const file = path.join(tmpdir(), `nk-giftcode-guard-${process.pid}.sql`);
    writeFileSync(file, sql, 'utf8');
    try {
      execFileSync(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
          'db',
          'execute',
          '--url',
          RAW_URL,
          '--file',
          file,
        ],
        { env: process.env, stdio: 'pipe' },
      );
    } finally {
      unlinkSync(file);
    }
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    dropProbe();
    await db.$disconnect();
  });

  const insert = (id: string, status: string, variantId: string | null): Promise<number> =>
    db.$executeRawUnsafe(
      `INSERT INTO \`${PROBE}\` (\`id\`, \`variantId\`, \`status\`) VALUES (?, ?, ?)`,
      id,
      variantId,
      status,
    );

  const update = (id: string, status: string, variantId: string | null): Promise<number> =>
    db.$executeRawUnsafe(
      `UPDATE \`${PROBE}\` SET \`status\` = ?, \`variantId\` = ? WHERE \`id\` = ?`,
      status,
      variantId,
      id,
    );

  it('REFUSES inserting a sellable code with no variant', async () => {
    await expect(insert('probe-1', 'available', null)).rejects.toThrow(
      /an available code must belong to a variant/,
    );
  });

  it('allows a sellable code that has one — the guard is not a blanket refusal', async () => {
    await expect(insert('probe-2', 'available', 'var_1')).resolves.toBe(1);
  });

  it('REFUSES detaching a sellable code from its variant', async () => {
    await expect(update('probe-2', 'available', null)).rejects.toThrow(
      /an available code must belong to a variant/,
    );
  });

  it('REFUSES reviving a detached code back to available — the refill vector', async () => {
    await insert('probe-3', 'voided', null);
    await expect(update('probe-3', 'available', null)).rejects.toThrow(
      /an available code must belong to a variant/,
    );
  });

  it('still allows RETIRING a detached code, which is how the 13 get cleaned up', async () => {
    await insert('probe-4', 'available', 'var_2');
    // Detach is refused while it is still sellable…
    await expect(update('probe-4', 'available', null)).rejects.toThrow(/must belong to a variant/);
    // …but the retire path (status first) is accepted.
    await expect(update('probe-4', 'voided', null)).resolves.toBe(1);
  });
});
