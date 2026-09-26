import { NextRequest, NextResponse } from 'next/server';

import { invalidateSecurityPolicyCache } from '@/api/adminAuth';
import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const VALID_KEYS = new Set([
  'appearance',
  'store-info',
  'notifications',
  'manual-transfer',
  'payment-gateway',
  'email',
  'security',
]);

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/settings/[key] — read a settings group (settings:read).
 * Groups: appearance (accent color + animation speed), store-info.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { key } = await ctx.params;
  if (!VALID_KEYS.has(key)) return NextResponse.json({ error: 'UNKNOWN_KEY' }, { status: 404 });

  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row) return NextResponse.json({}, { status: 200 });
  try {
    return NextResponse.json(JSON.parse(row.value), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}

/**
 * PUT /api/v1/admin/settings/[key] — save a settings group (settings:write).
 * Body is a JSON object; unknown fields are dropped per group schema.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { key } = await ctx.params;
  if (!VALID_KEYS.has(key)) return NextResponse.json({ error: 'UNKNOWN_KEY' }, { status: 404 });

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

  // Merge with the current value so partial saves don't wipe other fields.
  const current = await prisma.siteSetting.findUnique({ where: { key } });
  let currentObj: Record<string, unknown> = {};
  if (current) {
    try {
      const parsed: unknown = JSON.parse(current.value);
      if (typeof parsed === 'object' && parsed !== null)
        currentObj = parsed as Record<string, unknown>;
    } catch {
      // stale/corrupt row — start fresh
    }
  }

  let next: Record<string, unknown>;
  if (key === 'appearance') {
    // Explicit null clears the accent (back to default peach); omitted keeps it.
    const accent =
      b['accent'] === null
        ? null
        : typeof b['accent'] === 'string'
          ? b['accent']
          : currentObj['accent'];
    if (typeof accent === 'string' && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
      return NextResponse.json({ error: 'INVALID_ACCENT' }, { status: 400 });
    }
    const speed = typeof b['speed'] === 'string' ? b['speed'] : currentObj['speed'];
    if (typeof speed === 'string' && !['slow', 'normal', 'fast', 'off'].includes(speed)) {
      return NextResponse.json({ error: 'INVALID_SPEED' }, { status: 400 });
    }
    // Mascot image (client ask: ปลี่ยนมาสคอตจากหน้าแอดมินได้). Only paths
    // produced by /api/v1/admin/upload are accepted; explicit null restores
    // the built-in hamster.
    const mascotUrl =
      b['mascotUrl'] === null
        ? null
        : typeof b['mascotUrl'] === 'string'
          ? b['mascotUrl']
          : currentObj['mascotUrl'];
    if (typeof mascotUrl === 'string' && !/^\/api\/v1\/images\/[0-9a-z-]+$/i.test(mascotUrl)) {
      return NextResponse.json({ error: 'INVALID_MASCOT_URL' }, { status: 400 });
    }
    next = {};
    if (accent !== undefined) next['accent'] = accent ?? null;
    if (speed !== undefined) next['speed'] = speed;
    if (mascotUrl !== undefined) next['mascotUrl'] = mascotUrl ?? null;
  } else if (key === 'notifications') {
    // Discord webhook + low-stock threshold (แจ้งเตือน Discord / สต๊อกใกล้หมด).
    next = {};
    if (b['discordWebhookUrl'] === null || typeof b['discordWebhookUrl'] === 'string') {
      const url = b['discordWebhookUrl'];
      if (url === null || url === '') {
        next['discordWebhookUrl'] = null;
      } else if (
        typeof url === 'string' &&
        /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(url)
      ) {
        next['discordWebhookUrl'] = url.trim();
      } else {
        return NextResponse.json({ error: 'INVALID_WEBHOOK_URL' }, { status: 400 });
      }
    }
    if (b['lowStockThreshold'] !== undefined) {
      const t = Number(b['lowStockThreshold']);
      if (!Number.isInteger(t) || t < 0 || t > 1000) {
        return NextResponse.json({ error: 'INVALID_THRESHOLD' }, { status: 400 });
      }
      next['lowStockThreshold'] = t;
    }
  } else if (key === 'payment-gateway') {
    // PromptPay / Omise channel toggles and public identifiers. The Omise
    // secret is intentionally NOT part of this group: the database stores a
    // single string (the exact env var name to read at runtime), so the real
    // credential never reaches the DB and GET never echoes it back.
    next = {};
    if (typeof b['promptpayEnabled'] === 'boolean')
      next['promptpayEnabled'] = b['promptpayEnabled'];
    if (b['promptpayId'] === null) {
      next['promptpayId'] = null;
    } else if (typeof b['promptpayId'] === 'string') {
      const v = (b['promptpayId'] as string).replace(/[\s-]/g, '');
      if (v !== '' && !/^[0-9]{13}$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_PROMPTPAY_ID' }, { status: 400 });
      }
      next['promptpayId'] = v === '' ? null : v;
    }
    if (typeof b['cardEnabled'] === 'boolean') next['cardEnabled'] = b['cardEnabled'];
    if (b['omisePublicKey'] === null) {
      next['omisePublicKey'] = null;
    } else if (typeof b['omisePublicKey'] === 'string') {
      const v = (b['omisePublicKey'] as string).trim();
      if (v !== '' && !/^pkey_(test|live)_[A-Za-z0-9]+$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_OMISE_PUBLIC_KEY' }, { status: 400 });
      }
      next['omisePublicKey'] = v === '' ? null : v;
    }
    if (typeof b['omiseSecretKeyEnv'] === 'string') {
      // The Omise secret lives only in the deployment env; the DB stores the
      // NAME of the variable so ops can point it at a new key without code.
      const v = (b['omiseSecretKeyEnv'] as string).trim();
      if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_ENV_VAR_NAME' }, { status: 400 });
      }
      next['omiseSecretKeyEnv'] = v;
    }
  } else if (key === 'manual-transfer') {
    // Manual transfer instructions shown in checkout while the real Omise
    // gateway is not implemented (review High #2). Null clears a field.
    next = {};
    if (typeof b['enabled'] === 'boolean') next['enabled'] = b['enabled'];
    if (b['accountType'] === 'promptpay' || b['accountType'] === 'bank') {
      next['accountType'] = b['accountType'];
    }
    for (const field of ['accountName', 'bankName'] as const) {
      if (b[field] === null) {
        next[field] = null;
      } else if (typeof b[field] === 'string') {
        const v = (b[field] as string).trim().slice(0, 120);
        next[field] = v === '' ? null : v;
      }
    }
    if (b['accountNumber'] === null) {
      next['accountNumber'] = null;
    } else if (typeof b['accountNumber'] === 'string') {
      const v = (b['accountNumber'] as string).trim();
      if (v !== '' && !/^[0-9][0-9 \-]{5,29}$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_ACCOUNT_NUMBER' }, { status: 400 });
      }
      next['accountNumber'] = v === '' ? null : v;
    }
  } else if (key === 'email') {
    // Outbound-mail configuration. The SMTP password is intentionally NOT
    // stored here: like the Omise secret, only the ENV VAR NAME is persisted
    // and the credential itself never reaches the database.
    next = {};
    if (b['smtpHost'] === null) {
      next['smtpHost'] = null;
    } else if (typeof b['smtpHost'] === 'string') {
      next['smtpHost'] = (b['smtpHost'] as string).trim().slice(0, 253) || null;
    }
    if (b['smtpPort'] !== undefined) {
      const p = Number(b['smtpPort']);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return NextResponse.json({ error: 'INVALID_SMTP_PORT' }, { status: 400 });
      }
      next['smtpPort'] = p;
    }
    if (b['smtpUser'] === null) {
      next['smtpUser'] = null;
    } else if (typeof b['smtpUser'] === 'string') {
      next['smtpUser'] = (b['smtpUser'] as string).trim().slice(0, 120) || null;
    }
    if (b['smtpPasswordEnv'] !== undefined) {
      const v = String(b['smtpPasswordEnv']).trim();
      if (v !== '' && !/^[A-Z][A-Z0-9_]{2,63}$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_ENV_VAR_NAME' }, { status: 400 });
      }
      next['smtpPasswordEnv'] = v === '' ? null : v;
    }
    if (b['fromName'] === null) {
      next['fromName'] = null;
    } else if (typeof b['fromName'] === 'string') {
      next['fromName'] = (b['fromName'] as string).trim().slice(0, 120) || null;
    }
    if (b['fromEmail'] === null) {
      next['fromEmail'] = null;
    } else if (typeof b['fromEmail'] === 'string') {
      const v = (b['fromEmail'] as string).trim();
      if (v !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return NextResponse.json({ error: 'INVALID_FROM_EMAIL' }, { status: 400 });
      }
      next['fromEmail'] = v === '' ? null : v;
    }
    if (typeof b['emailTemplates'] === 'object' && b['emailTemplates'] !== null) {
      // Toggle map for the fixed template set — only known keys survive.
      const t = b['emailTemplates'] as Record<string, unknown>;
      const templates: Record<string, boolean> = {};
      for (const k of ['order_confirm', 'code_delivery', 'low_stock', 'invoice'] as const) {
        if (typeof t[k] === 'boolean') templates[k] = t[k];
      }
      next['emailTemplates'] = templates;
    }
  } else if (key === 'security') {
    // These values are ENFORCED by the runtime, not decorative: login
    // lockout (src/api/adminAuth.ts) and the password policy
    // (change-password / self-service paths) read this group on every use.
    next = {};
    if (b['lockoutMaxAttempts'] !== undefined) {
      const v = Number(b['lockoutMaxAttempts']);
      if (!Number.isInteger(v) || v < 3 || v > 10) {
        return NextResponse.json({ error: 'INVALID_LOCKOUT_ATTEMPTS' }, { status: 400 });
      }
      next['lockoutMaxAttempts'] = v;
    }
    if (b['lockoutMinutes'] !== undefined) {
      const v = Number(b['lockoutMinutes']);
      if (!Number.isInteger(v) || v < 5 || v > 1440) {
        return NextResponse.json({ error: 'INVALID_LOCKOUT_MINUTES' }, { status: 400 });
      }
      next['lockoutMinutes'] = v;
    }
    if (b['passwordMinLength'] !== undefined) {
      const v = Number(b['passwordMinLength']);
      if (!Number.isInteger(v) || v < 8 || v > 64) {
        return NextResponse.json({ error: 'INVALID_PASSWORD_MIN_LENGTH' }, { status: 400 });
      }
      next['passwordMinLength'] = v;
    }
    for (const rule of [
      'pwRequireUpper',
      'pwRequireLower',
      'pwRequireDigit',
      'pwRequireSpecial',
    ] as const) {
      if (typeof b[rule] === 'boolean') next[rule] = b[rule];
    }
  } else {
    // store-info: whitelist string fields.
    next = {};
    for (const field of ['name', 'description', 'email', 'phone', 'line', 'facebook'] as const) {
      if (typeof b[field] === 'string') next[field] = (b[field] as string).trim();
    }
  }

  const value = JSON.stringify({ ...currentObj, ...next });
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value, updatedBy: check.payload?.sub ?? null },
    create: { key, value, updatedBy: check.payload?.sub ?? null },
  });

  // The security group is enforced at runtime — drop the 30s policy cache so
  // the new values bite on the next login/password change.
  if (key === 'security') invalidateSecurityPolicyCache();

  return NextResponse.json(JSON.parse(value), { status: 200 });
}
