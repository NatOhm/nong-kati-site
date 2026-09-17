import { NextRequest, NextResponse } from 'next/server';

import { getAnnouncement } from '@/lib/data';
import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/** Extract a validation-usable announcement payload from an unknown body. */
function parseBody(body: unknown): {
  message?: string | undefined;
  href?: string | null | undefined;
  enabled?: boolean | undefined;
} {
  if (typeof body !== 'object' || body === null) return {};
  const b = body as Record<string, unknown>;
  return {
    message: typeof b['message'] === 'string' ? b['message'] : undefined,
    href:
      b['href'] === null || b['href'] === ''
        ? null
        : typeof b['href'] === 'string'
          ? b['href']
          : undefined,
    enabled: typeof b['enabled'] === 'boolean' ? b['enabled'] : undefined,
  };
}

/**
 * GET /api/v1/admin/announcement — current announcement (settings:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  return NextResponse.json(await getAnnouncement());
}

/**
 * PUT /api/v1/admin/announcement — upsert the announcement (settings:write).
 */
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
  const { message, href, enabled } = parseBody(body);

  const current = await getAnnouncement();
  const nextMessage = message?.trim();
  if (nextMessage === '' && (enabled ?? current.enabled)) {
    return NextResponse.json({ error: 'MESSAGE_REQUIRED' }, { status: 400 });
  }

  const value = JSON.stringify({
    message: nextMessage ?? current.message,
    href: href !== undefined ? href : current.href,
    enabled: enabled ?? current.enabled,
  });

  const saved = await prisma.siteSetting.upsert({
    where: { key: 'announcement' },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key: 'announcement', value, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json({
    ...(JSON.parse(saved.value) as { message: string; href: string | null; enabled: boolean }),
    updatedAt: saved.updatedAt.toISOString(),
  });
}
