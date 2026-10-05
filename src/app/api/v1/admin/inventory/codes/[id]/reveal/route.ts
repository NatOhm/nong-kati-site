/**
 * GET /api/v1/admin/inventory/codes/:id/reveal — decrypt ONE stored account.
 *
 * Declared in the route-permission matrix (08-auth §7.4) since the original
 * inventory work, along with the `inventory:reveal` permission and the
 * `decryptCode` helper — but never implemented. Staff could paste accounts
 * into a product and could then only ever see a COUNT, never the accounts
 * themselves (client report 2026-10-05).
 *
 * Security posture, all of it deliberate:
 *  - Gated on `inventory:reveal`, which ROLE_PERMISSIONS grants to
 *    super_admin ONLY. Catalogue managers — the staff who do the pasting —
 *    deliberately cannot see stored credentials back.
 *  - Every reveal is AUDITED. Reading a stored password is a
 *    security-relevant event; there must be a server-side record of which
 *    admin opened which credential, or the permission is unfalsifiable.
 *  - Decryption happens per request. Nothing plaintext is cached or stored.
 *  - The error body never contains the code — only its id and status — so a
 *    failed decrypt cannot leak the thing that failed to decrypt.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import { decryptCode } from '@/lib/crypto/giftCode';

export const dynamic = 'force-dynamic';

/**
 * Statuses whose plaintext is still meaningful to show. A delivered code is
 * still a real account the customer bought — staff legitimately need to read
 * it back when handling a support ticket — so it is NOT excluded. Voided and
 * expired codes are excluded: they are no longer live stock.
 */
const REVEALABLE = new Set(['available', 'reserved', 'delivered']);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'inventory:reveal');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;

  const { id } = await ctx.params;

  const code = await prisma.giftCode.findUnique({
    where: { id },
    include: {
      variant: {
        select: { label: true, product: { select: { name: true } } },
      },
    },
  });
  if (!code) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!REVEALABLE.has(code.status)) {
    // 409, not 403: the caller IS allowed, the row just isn't revealable.
    return NextResponse.json({ error: 'CODE_NOT_REVEALABLE', status: code.status }, { status: 409 });
  }

  let plaintext: string;
  try {
    plaintext = decryptCode(code.codeEncrypted, code.nonce, code.keyVersion);
  } catch {
    // Deliberately opaque: a key-version mismatch must not tell the caller
    // anything about the ciphertext.
    return NextResponse.json({ error: 'DECRYPT_FAILED' }, { status: 500 });
  }

  await writeAuditLog({
    actorType: 'admin',
    actorId: actor.sub,
    actorEmail: actor.email,
    action: 'inventory.code_reveal',
    tableName: 'GiftCode',
    recordId: code.id,
    // Deliberately NO before/after: the diff fields are persisted, and
    // writing the plaintext there would undo the encryption at rest for the
    // single most sensitive record in the system.
    diff: null,
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    metadata: {
      variantId: code.variantId,
      variantLabel: code.variant.label,
      productName: code.variant.product.name,
      codeStatus: code.status,
    },
  });

  return NextResponse.json({
    id: code.id,
    code: plaintext,
    status: code.status,
    variantLabel: code.variant.label,
    productName: code.variant.product.name,
    createdAt: code.createdAt.toISOString(),
    deliveredAt: code.deliveredAt?.toISOString() ?? null,
  });
}