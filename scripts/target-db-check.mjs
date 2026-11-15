#!/usr/bin/env node
// ─── Nong-Kati — target-db-check.mjs ────────────────────────────────────────
// "Does this database already exist?" — asked BEFORE any Phase 6 step runs.
//
// Why this is a script and not a line of SQL in the driver: `prisma migrate deploy`
// CREATES a MySQL database that does not exist (measured 2026-11-15, it printed
// "MySQL database nk_p6_absent created"). So a typo in TARGET_DATABASE_URL does not
// fail — it migrates an empty database, the ETL then copies production rows into it,
// and the window reports success against a database nobody meant to create. The only
// safe moment to notice is before step 1.
//
// It also separates two very different failures that Prisma reports nearly alike:
// a database that is missing (create it first) and a server that cannot be reached
// (start the tunnel) — the driver must not tell you to create a database when the
// tunnel is simply down.
//
// Usage
//   node scripts/target-db-check.mjs --url="mysql://user:pass@host:3306/nong_kati"
//   TARGET_DATABASE_URL=… node scripts/target-db-check.mjs
//
// Exit: 0 exists · 3 missing (named) · 4 unreachable · 5 bad invocation
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client';

function argOf(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

const url = argOf('url') || process.env.TARGET_DATABASE_URL || '';
if (!url) {
  console.error('✖ target-db-check: no URL (pass --url= or set TARGET_DATABASE_URL).');
  process.exit(5);
}

let dbName;
try {
  dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
} catch {
  console.error('✖ target-db-check: that is not a parseable database URL.');
  process.exit(5);
}
if (!dbName) {
  console.error('✖ target-db-check: the URL names no database (…:3306/ with nothing after the slash).');
  process.exit(5);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  // Any statement that needs the database to exist; P1003 is what Prisma reports when
  // it does not, and the check must not create anything on the way.
  await prisma.$queryRaw`SELECT 1`;
  console.log(`✔ target database "${dbName}" exists`);
  process.exitCode = 0;
} catch (error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  // Prisma's P1001 message starts with a blank line; the reason is a few lines down.
  const firstLine = message.split('\n').map((line) => line.trim()).find(Boolean) || '(no detail)';
  if (code === 'P1003' || /Unknown database|does not exist/i.test(message)) {
    console.error(`✖ target database "${dbName}" does not exist`);
    process.exitCode = 3;
  } else if (code === 'P1001' || /Can't reach database server|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
    console.error(`✖ target database server is unreachable (not "missing"): ${firstLine}`);
    process.exitCode = 4;
  } else {
    console.error(`✖ target database check failed: ${code || 'no code'} ${firstLine}`);
    process.exitCode = 4;
  }
} finally {
  await prisma.$disconnect();
}
