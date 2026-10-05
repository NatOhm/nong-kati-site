/**
 * PATCH /api/v1/admin/inventory/codes/:id — CORRECT ONE stored account.
 *
 * The third leg of the stored-account story, and the one that was missing:
 * staff could SHOW an account (reveal) and REMOVE one (void), but a paste
 * with a single typo — a wrong digit, a truncated password, an email pasted
 * into the password column — was baked into stock permanently. The only
 * remedy was to void the row, which also burns a unit of stock and loses
 * the sequence position, for what is really a typo.
 *
 * An edit therefore REPLACES the stored account rather than patching
 * individual columns:
 *  - the plaintext is re-encrypted under the active key version, with a FRESH
 *    nonce (never reused), and re-hashed for the global dedup constraint;
 *  - `codeHash` is UNIQUE across all variants, so a correction that collides
 *    with an account that already exists must be refused (409 DUPLICATE_CODE)
 *    rather than blowing up on the constraint;
 *  - stock is untouched. Correcting an unsold account neither adds nor
 *    removes a sellable unit — that is exactly what distinguishes this from
 *    void-then-restock, which would churn the ledger.
 *
 * Only `available` rows are editable. Once an account is reserved or
 * delivered it is the customer's — silently rewriting it would make the
 * shop's record disagree with what the customer was actually given. Void
 * remains the route for those.
 *
 * Gated on `inventory:reveal` (super_admin only), the SAME permission that
 * guards reading an account back: rewriting a credential is at least as
 * sensitive as reading one, and staff who may paste but not read must not
 * gain the ability to alter what they cannot see.
 *
 * The response never echoes the plaintext, and the audit row carries
 * `diff: null` for the same reason the reveal does.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import { decryptCode, encryptCode, hashCode, maskCode } from '@/lib/crypto/giftCode';

export const dynamic = 'force-dynamic';

/** Only stock that is still sellable may be corrected in place. */
const EDITABLE = new Set(['available']);

/**
 * Generous, because the bulk-paste "long" format stores a whole multi-line
 * account record (email line, password line, expiry line, terms) as ONE
 * account — an email+password row is ~40 chars, a full delivery block is a
 * few hundred. Bounded anyway so the request body cannot be used to push
 * megabytes through the encrypt path.
 */
const MAX_CODE_LENGTH = 8000;

export async function PATCH(
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

  let next = '';
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const raw = body['code'];
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: 'CODE_REQUIRED' }, { status: 400 });
    }
    next = raw.trim();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  if (next.length === 0) {
    return NextResponse.json({ error: 'CODE_EMPTY' }, { status: 400 });
  }
  if (next.length > MAX_CODE_LENGTH) {
    return NextResponse.json({ error: 'CODE_TOO_LONG', maxLength: MAX_CODE_LENGTH }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const code = await tx.giftCode.findUnique({
        where: { id },
        include: {
          variant: { select: { label: true, product: { select: { name: true } } } },
        },
      });
      if (!code) return { status: 404 as const, error: 'NOT_FOUND' };
      if (!EDITABLE.has(code.status)) {
        return { status: 409 as const, error: 'CODE_NOT_EDITABLE', codeStatus: code.status };
      }

      const nextHash = hashCode(next);

      // Global uniqueness is enforced by a DB constraint. Check it here so a
      // collision is an honest 409 naming the problem, not a 500 from the
      // driver — and so the message can say WHICH account it collides with.
      const collision = await tx.giftCode.findUnique({
        where: { codeHash: nextHash },
        select: { id: true },
      });
      if (collision && collision.id !== id) {
        return { status: 409 as const, error: 'DUPLICATE_CODE' };
      }

      // No-op save (the admin hit save without changing anything) must not
      // burn an audit row or a needless re-encryption.
      let unchanged = false;
      try {
        unchanged = decryptCode(code.codeEncrypted, code.nonce, code.keyVersion) === next;
      } catch {
        // Unreadable row that we are about to overwrite anyway — not a no-op.
        unchanged = false;
      }
      if (unchanged) {
        return {
          status: 200 as const,
          ok: true,
          changed: false,
          id: code.id,
          masked: maskCode(next),
        };
      }

      const { ciphertext, nonce, keyVersion } = encryptCode(next);

      // CAS on `status: 'available'`, exactly as the void does: if a sale or
      // a second edit won the race between the read above and this write,
      // zero rows change and we refuse instead of overwriting live stock.
      const written = await tx.giftCode.updateMany({
        where: { id, status: 'available' },
        data: { codeEncrypted: ciphertext, nonce, codeHash: nextHash, keyVersion },
      });
      if (written.count !== 1) {
        return { status: 409 as const, error: 'CODE_NOT_EDITABLE', codeStatus: code.status };
      }

      await writeAuditLog({
        actorType: 'admin',
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'inventory.code_edit',
        tableName: 'GiftCode',
        recordId: code.id,
        // NO before/after. The diff columns are persisted; the "before" value
        // IS the old plaintext, so writing it would undo the encryption at
        // rest for the most sensitive record in the system.
        diff: null,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        metadata: {
          variantId: code.variantId,
          variantLabel: code.variant.label,
          productName: code.variant.product.name,
          codeStatus: code.status,
          length: next.length,
        },
        tx,
      });

      return {
        status: 200 as const,
        ok: true,
        changed: true,
        id: code.id,
        masked: maskCode(next),
      };
    });

    if (result.status !== 200) {
      return NextResponse.json(
        { error: result.error, ...('codeStatus' in result ? { status: result.codeStatus } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[inventory] code edit failed', err);
    return NextResponse.json({ error: 'EDIT_FAILED' }, { status: 500 });
  }
}