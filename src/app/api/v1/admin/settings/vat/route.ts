import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/** GET /api/v1/admin/settings/vat — get current VAT settings */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: 'vat' } });
  if (!row) {
    return NextResponse.json({ enabled: false, rate: 7 });
  }

  try {
    const parsed = JSON.parse(row.value) as { enabled?: boolean; rate?: number };
    return NextResponse.json({
      enabled: parsed.enabled ?? false,
      rate: typeof parsed.rate === 'number' ? parsed.rate : 7,
    });
  } catch {
    return NextResponse.json({ enabled: false, rate: 7 });
  }
}

/** PUT /api/v1/admin/settings/vat — update VAT settings */
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
  const b = (body ?? {}) as Record<string, unknown>;

  const enabled = b['enabled'] === true;
  const rate = typeof b['rate'] === 'number' && b['rate'] > 0 ? b['rate'] : 7;

  // Validate rate is reasonable (0.1% to 30%)
  if (rate < 0.1 || rate > 30) {
    return NextResponse.json({ error: 'INVALID_RATE' }, { status: 400 });
  }

  await prisma.siteSetting.upsert({
    where: { key: 'vat' },
    update: {
      value: JSON.stringify({ enabled, rate }),
      updatedBy: check.payload?.sub ?? null,
    },
    create: {
      key: 'vat',
      value: JSON.stringify({ enabled, rate }),
      updatedBy: check.payload?.sub ?? null,
    },
  });

  return NextResponse.json({ enabled, rate });
}
