import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import {
  DEFAULT_TRUST_BADGES,
  normalizeTrustBadgesBody,
  parseTrustBadges,
  type TrustBadgesSettings,
} from '@/lib/trustBadges';

export type { TrustBadgeIconKey, TrustBadgeItem, TrustBadgesSettings } from '@/lib/trustBadges';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

function sameSettings(a: TrustBadgesSettings, b: TrustBadgesSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.title === b.title &&
    a.items.length === b.items.length &&
    a.items.every(
      (item, i) =>
        item.icon === b.items[i]?.icon &&
        item.title === b.items[i]?.title &&
        item.desc === b.items[i]?.desc,
    )
  );
}

/** GET /api/v1/admin/settings/trust-badges — read saved badges (settings:read). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: 'trustBadges' } });
  if (!row) {
    // No row yet: the built-in section (same copy as before it was editable).
    return NextResponse.json(DEFAULT_TRUST_BADGES, { status: 200 });
  }
  return NextResponse.json(parseTrustBadges(row.value), { status: 200 });
}

/** PUT /api/v1/admin/settings/trust-badges — save badges (settings:write). */
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

  const current = await prisma.siteSetting.findUnique({ where: { key: 'trustBadges' } });
  const currentSettings: TrustBadgesSettings = current
    ? parseTrustBadges(current.value)
    : structuredClone(DEFAULT_TRUST_BADGES);
  const next = normalizeTrustBadgesBody(b, currentSettings);

  // Nothing usable changed → answer from current state without writing.
  if (sameSettings(next, currentSettings)) {
    return NextResponse.json(currentSettings, { status: 200 });
  }

  const value = JSON.stringify(next);
  const saved = await prisma.siteSetting.upsert({
    where: { key: 'trustBadges' },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key: 'trustBadges', value, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json(parseTrustBadges(saved.value), { status: 200 });
}
