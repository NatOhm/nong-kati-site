import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import {
  DEFAULT_OG_SHARE,
  normalizeOgShareBody,
  parseOgShare,
  type OgShareSettings,
} from '@/lib/ogShareSettings';

export type { OgShareSettings } from '@/lib/ogShareSettings';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

function sameSettings(a: OgShareSettings, b: OgShareSettings): boolean {
  return (
    a.headingLine1 === b.headingLine1 &&
    a.headingLine2 === b.headingLine2 &&
    a.channels === b.channels &&
    a.pill1 === b.pill1 &&
    a.pill2 === b.pill2 &&
    a.ogTitle === b.ogTitle &&
    a.ogDescription === b.ogDescription
  );
}

/** GET /api/v1/admin/settings/og-share — read share-preview copy (settings:read). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: 'ogShare' } });
  if (!row) {
    // No row yet: the built-in copy (same strings as before it was editable).
    return NextResponse.json(DEFAULT_OG_SHARE, { status: 200 });
  }
  return NextResponse.json(parseOgShare(row.value), { status: 200 });
}

/** PUT /api/v1/admin/settings/og-share — save share-preview copy (settings:write). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const current = await prisma.siteSetting.findUnique({ where: { key: 'ogShare' } });
  const currentSettings: OgShareSettings = current
    ? parseOgShare(current.value)
    : structuredClone(DEFAULT_OG_SHARE);
  const next = normalizeOgShareBody(b);

  // Nothing usable changed → answer from current state without writing.
  if (sameSettings(next, currentSettings)) {
    return NextResponse.json(currentSettings, { status: 200 });
  }

  const value = JSON.stringify(next);
  const saved = await prisma.siteSetting.upsert({
    where: { key: 'ogShare' },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key: 'ogShare', value, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json(parseOgShare(saved.value), { status: 200 });
}
