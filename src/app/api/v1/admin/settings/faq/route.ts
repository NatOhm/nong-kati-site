import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { normalizeFaqBody, parseFaqSettings, type FaqSettings } from '@/lib/faqSettings';

export type { FaqItem, FaqSettings } from '@/lib/faqSettings';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/** Thai-friendly slug for FAQ items, kept only because the FAQ editor may allow
 *  reordering / labeling in a future tab; the current contract stores items by
 *  array index, but slugs keep IDs stable if we ever expose them. */
function faqSlug(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{Letter}\p{Number}-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `faq-${Date.now()}`
  );
}

/** GET /api/v1/admin/settings/faq — read saved FAQ (settings:read). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: 'faq' } });
  if (!row) {
    // No row yet: section visible by default, empty list (same as before).
    return NextResponse.json({ enabled: true, items: [] }, { status: 200 });
  }
  const settings = parseFaqSettings(row.value);
  return NextResponse.json(settings, { status: 200 });
}

/** PUT /api/v1/admin/settings/faq — save FAQ (settings:write). */
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

  const current = await prisma.siteSetting.findUnique({ where: { key: 'faq' } });
  const currentSettings: FaqSettings = current
    ? parseFaqSettings(current.value)
    : { enabled: true, items: [] };
  const next = normalizeFaqBody(b, currentSettings);

  if (
    next.enabled === currentSettings.enabled &&
    next.items.length === currentSettings.items.length &&
    next.items.every(
      (item, i) =>
        item.question === currentSettings.items[i]?.question &&
        item.answer === currentSettings.items[i]?.answer,
    )
  ) {
    return NextResponse.json(currentSettings, { status: 200 });
  }

  const value = JSON.stringify(next);
  const saved = await prisma.siteSetting.upsert({
    where: { key: 'faq' },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key: 'faq', value, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json(parseFaqSettings(saved.value), { status: 200 });
}
