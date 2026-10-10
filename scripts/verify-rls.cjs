/**
 * RLS baseline verification (production review, High) — run by the CI
 * Concurrency job right after `prisma migrate deploy` on a real Postgres.
 *
 * Asserts:
 *   1. EVERY table in schema `public` has rowsecurity = true (the baseline
 *      migration enables RLS on all of them, including Prisma's own
 *      _prisma_migrations table). A new model whose table ships without
 *      RLS fails this check — exactly the gap it exists to catch.
 *   2. Where the Supabase client roles (`anon`, `authenticated`) exist,
 *      they hold ZERO table privileges in `public` — the Data API can see
 *      nothing even if a schema gets exposed by accident.
 *   3. The CONNECTING role still bypasses RLS on every RLS-enabled table:
 *      it owns the table, is superuser, or has BYPASSRLS. Deny-by-default
 *      RLS assumes the application IS the owner (20260927200000_rls_baseline
 *      documents that rule and deliberately avoids FORCE ROW LEVEL SECURITY).
 *      When that assumption breaks the symptom is silent — reads return zero
 *      rows, not an error — so nothing else in the pipeline would notice. This
 *      check turns it into a named failure.
 *
 * Uses the Prisma client's raw connection (pg is not a dependency) and
 * never touches application tables — safe to run against any environment.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const missing = await prisma.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity = false ORDER BY tablename",
    );
    if (missing.length > 0) {
      console.error(
        'RLS not enabled on: ' + missing.map((r) => r.tablename).join(', '),
      );
      process.exit(1);
    }
    const total = await prisma.$queryRawUnsafe(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
    );
    console.log('RLS enabled on all ' + total[0].n + ' public tables');

    const hidden = await prisma.$queryRawUnsafe(
      "SELECT c.relname AS table_name, owner.rolname AS owner_name " +
        'FROM pg_class c ' +
        'JOIN pg_namespace n ON n.oid = c.relnamespace ' +
        'JOIN pg_roles owner ON owner.oid = c.relowner ' +
        "WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity " +
        'AND owner.rolname IS DISTINCT FROM current_user ' +
        'AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) ' +
        'ORDER BY c.relname',
    );
    if (hidden.length > 0) {
      console.error(
        'connecting role does not bypass RLS on: ' +
          hidden.map((r) => r.table_name + ' (owner ' + r.owner_name + ')').join(', ') +
          ' — RLS with no policies returns zero rows to the application. Connect as the owner or ship a reviewed policy.',
      );
      process.exit(1);
    }
    console.log('connecting role bypasses RLS on every public table');

    for (const role of ['anon', 'authenticated']) {
      const exists = await prisma.$queryRawUnsafe(
        "SELECT 1 FROM pg_roles WHERE rolname='" + role + "'",
      );
      if (exists.length === 0) continue; // plain Postgres (CI) — roles absent
      const granted = await prisma.$queryRawUnsafe(
        "SELECT privilege_type FROM information_schema.table_privileges WHERE grantee='" +
          role +
          "' AND table_schema='public' LIMIT 1",
      );
      if (granted.length > 0) {
        console.error('client role still has table privileges: ' + role);
        process.exit(1);
      }
      console.log('client role has zero table privileges: ' + role);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
