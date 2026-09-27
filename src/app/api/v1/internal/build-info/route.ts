import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/internal/build-info — non-secret release diagnostics
 * (production review HIGH-4: provenance verification without exposing
 * credentials or operational detail).
 *
 * Answers:
 *  - gitSha / gitRef: the exact commit deployed (vercel.json injects
 *    GIT_SHA at build time; the CI run also records its own SHA).
 *  - migrationVersion: the newest row in _prisma_migrations that actually
 *    finished — proves the DB the app is talking to has been migrated.
 *  - rls: whether every public-table row reports row security enabled —
 *    proves the deny-by-default baseline is live on this database.
 *
 * Auth: internal token (NK_INTERNAL_TOKEN) or a valid admin JWT (Bearer) —
 * the same pair the outbox drain endpoint accepts. No secrets, no PII, no
 * counts: safe to expose behind auth for release verification.
 */

const GIT_SHA = process.env['GIT_SHA'] ?? process.env['VERCEL_GIT_COMMIT_SHA'] ?? '';
const GIT_REF = process.env['VERCEL_GIT_COMMIT_REF'] ?? '';

async function readLocalGitSha(): Promise<string> {
  if (GIT_SHA) return GIT_SHA;
  try {
    const head = await readFile(path.join(process.cwd(), '.git', 'HEAD'), 'utf8');
    const ref = head.trim();
    if (ref.startsWith('ref: ')) {
      const refPath = ref.slice(5);
      return (await readFile(path.join(process.cwd(), '.git', refPath), 'utf8')).trim() || '';
    }
    return ref;
  } catch {
    return '';
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const internalToken = process.env['NK_INTERNAL_TOKEN'];
  const header = req.headers.get('authorization');
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : '';

  let authenticated = false;
  if (internalToken && bearerToken && bearerToken === internalToken) authenticated = true;
  if (!authenticated && bearerToken) {
    const { verifyAdminJwt } = await import('@/lib/jwt');
    authenticated = Boolean(await verifyAdminJwt(bearerToken));
  }
  if (!authenticated) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const gitSha = await readLocalGitSha();

  // Migration + RLS state: read-only catalog queries, never throws into a
  // 500 — a database that cannot answer is itself the diagnostic answer.
  let migrationVersion: string | null = null;
  let migrationFinishedAt: string | null = null;
  let rlsEnabled = true;
  let rlsTablesChecked = 0;
  let rlsMissing: string[] = [];
  let dbError: string | null = null;

  try {
    const migrations = await prisma.$queryRawUnsafe<
      {
        migration_name: string;
        finished_at: Date | null;
      }[]
    >(
      'SELECT migration_name, finished_at FROM _prisma_migrations\n      WHERE finished_at IS NOT NULL\n      ORDER BY finished_at DESC LIMIT 1',
    );
    if (migrations[0]) {
      migrationVersion = migrations[0].migration_name;
      migrationFinishedAt = migrations[0].finished_at?.toISOString() ?? null;
    }

    const rlsRows = await prisma.$queryRawUnsafe<{ tablename: string; rowsecurity: boolean }[]>(
      "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'",
    );
    rlsTablesChecked = rlsRows.length;
    rlsMissing = rlsRows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    rlsEnabled = rlsMissing.length === 0;
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'database query failed';
    rlsEnabled = false;
  }

  return NextResponse.json(
    {
      gitSha,
      gitRef: GIT_REF,
      migrationVersion,
      migrationFinishedAt,
      rls: { enabled: rlsEnabled, tablesChecked: rlsTablesChecked, missing: rlsMissing },
      dbError,
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
