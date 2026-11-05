import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { TAX_INVOICE_SETTING_KEY, getTaxInvoiceConfig } from '@/lib/taxInvoice';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  return getAdminToken(req);
}

/** GET /api/v1/admin/settings/tax-invoice — is the ใบกำกับภาษี request open? */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const config = await getTaxInvoiceConfig();
  return NextResponse.json({ enabled: config.enabled });
}

/** PUT /api/v1/admin/settings/tax-invoice — turn the request surface on/off */
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
  const enabled = ((body ?? {}) as Record<string, unknown>)['enabled'];
  // No coercion: "false"/0 must not silently flip the switch one way or another.
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'INVALID_ENABLED' }, { status: 400 });
  }

  const value = JSON.stringify({ enabled });
  await prisma.siteSetting.upsert({
    where: { key: TAX_INVOICE_SETTING_KEY },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key: TAX_INVOICE_SETTING_KEY, value, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json({ enabled });
}
