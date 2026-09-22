import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { encryptCode, hashCode } from '@/lib/crypto/giftCode';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/** Reference-prefix/column cleanup (client list: Long/detailed format with refs). */
const REF_RE = /^[[(]?(?:id|ref|order|inv|refid)\s*[:：\-]\s*.*$/i;

/**
 * POST /api/v1/admin/stock/bulk — paste-in stock for a product (products:write).
 *
 * Body:
 *   { productId, format: 'short' | 'long', separator: ',' | ';' | 'tab' | 'newline',
 *     raw: string, apply?: boolean }
 *
 * - short   → one account per line: "user:pass" (whole line = the code text)
 * - long    → fields joined by `separator`: code[,code,...][,ref] — every field
 *             except the ref keeps its own text; trailing ref column is dropped.
 * - Preview (apply=false) parses and returns per-variant plans without writing.
 * - apply=true creates encrypted available GiftCodes + StockMove(restock) in one
 *   transaction per variant, updating ProductVariant.stock.
 *
 * Returns 400 NO_VARIANTS when the product has no active variants; every variant
 * with unparsed lines gets them echoed back so the modal can highlight them.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
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
  const productId = typeof b['productId'] === 'string' ? b['productId'] : '';
  const format = b['format'] === 'long' ? 'long' : 'short';
  const separator = [';', 'tab', 'newline'].includes(b['separator'] as string)
    ? (b['separator'] as string)
    : ',';
  const raw = typeof b['raw'] === 'string' ? b['raw'] : '';
  const apply = b['apply'] === true;

  if (!productId || !raw.trim()) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true, stock: true },
      },
    },
  });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (product.variants.length === 0) {
    return NextResponse.json({ error: 'NO_VARIANTS' }, { status: 400 });
  }

  // ── Parse ────────────────────────────────────────────────
  // Round-robin across the product's variants so multi-variant products can be
  // filled in one paste. An explicit "label:" prefix pins a record.
  const perVariant = new Map<string, { variantId: string; label: string; codes: string[] }>(
    product.variants.map((v) => [v.id, { variantId: v.id, label: v.label, codes: [] }]),
  );
  const order = product.variants.map((v) => v.id);
  let cursor = 0;

  // Records: long format = blocks separated by 2+ consecutive blank lines
  // (single blank lines are preserved INSIDE a record — vendor templates keep
  // their pretty spacing); short format = one record per line.
  const records: string[] = [];
  if (format === 'long') {
    let block: string[] = [];
    let blankRun = 0;
    for (const l of raw.split(/\r?\n/)) {
      if (l.trim() === '') {
        blankRun += 1;
        if (blankRun === 1 && block.length > 0) block.push('');
        continue;
      }
      if (blankRun >= 2 && block.length > 0) {
        while (block.length > 0 && block[block.length - 1] === '') block.pop();
        records.push(block.join('\n'));
        block = [];
      }
      blankRun = 0;
      block.push(l);
    }
    if (block.length > 0) {
      while (block.length > 0 && block[block.length - 1] === '') block.pop();
      records.push(block.join('\n'));
    }
  } else {
    for (const l of raw.split(/\r?\n/)) {
      const t = l.trim();
      if (t !== '') records.push(t);
    }
  }

  for (const record of records) {
    let work = record;
    let pinned: string | null = null;

    const pin = work.match(/^([^,:;]+)\s*[:：]\s*(.+)$/);
    const pinLabel = pin?.[1]?.trim();
    if (pin && pinLabel && product.variants.some((v) => v.label === pinLabel)) {
      pinned = product.variants.find((v) => v.label === pinLabel)!.id;
      work = pin[2]!.trim();
    }

    if (format === 'long') {
      // Whole multi-line block = one account record, delivered as-is.
      push(work);
    } else {
      // Short format: strip a reference prefix, whole remainder is the code text.
      const code = work.replace(REF_RE, '').trim();
      if (code) push(code);
    }

    function push(code: string): void {
      const target = pinned ?? order[cursor % order.length]!;
      const bucket = perVariant.get(target)!;
      bucket.codes.push(code);
      if (!pinned) cursor += 1;
    }
  }

  // Dedupe: within the pasted batch, and against codes already stored.
  // Re-pasting the same file must be a no-op for duplicates, never a 500.
  const seen = new Set<string>();
  for (const bucket of perVariant.values()) {
    bucket.codes = bucket.codes.filter((c) => {
      const h = hashCode(c).toString('hex');
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    });
  }
  const hashList = [...seen].map((h) => Buffer.from(h, 'hex'));
  const existingRows =
    hashList.length > 0
      ? await prisma.giftCode.findMany({
          where: { codeHash: { in: hashList } },
          select: { codeHash: true },
        })
      : [];
  const existingHashes = new Set(existingRows.map((r) => r.codeHash.toString('hex')));
  let duplicates = 0;
  for (const bucket of perVariant.values()) {
    const fresh = bucket.codes.filter((c) => {
      const isDup = existingHashes.has(hashCode(c).toString('hex'));
      if (isDup) duplicates += 1;
      return !isDup;
    });
    bucket.codes = fresh;
  }

  const plans = [...perVariant.values()]
    .map((p) => ({
      variantId: p.variantId,
      label: p.label,
      count: p.codes.length,
      currentStock: product.variants.find((v) => v.id === p.variantId)!.stock,
      codes: p.codes,
    }))
    .filter((p) => p.count > 0);

  if (!apply) {
    return NextResponse.json({
      product: { id: product.id, name: product.name },
      plans,
      duplicates,
    });
  }

  // ── Apply ────────────────────────────────────────────────
  const results: { variantId: string; label: string; added: number }[] = [];
  const adminId = check.payload?.sub ?? null;

  for (const plan of plans) {
    if (plan.codes.length === 0) continue;
    const added = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: plan.variantId },
        select: { stock: true },
      });
      if (!variant) throw new Error('VARIANT_DELETED');

      const rows = plan.codes.map((code) => {
        const { ciphertext, nonce } = encryptCode(code);
        return {
          variantId: plan.variantId,
          codeEncrypted: ciphertext,
          codeHash: hashCode(code),
          nonce,
          status: 'available',
          uploadedById: adminId,
        };
      });
      await tx.giftCode.createMany({ data: rows });
      const stockAfter = variant.stock + rows.length;
      await tx.productVariant.update({
        where: { id: plan.variantId },
        data: { stock: { increment: rows.length } },
      });
      await tx.stockMove.create({
        data: {
          variantId: plan.variantId,
          delta: rows.length,
          reason: 'restock',
          refType: 'upload',
          note: `bulk paste ${rows.length} accounts`,
          stockAfter,
          actorId: adminId,
        },
      });
      return rows.length;
    });
    results.push({ variantId: plan.variantId, label: plan.label, added });
  }

  return NextResponse.json({
    product: { id: product.id, name: product.name },
    results,
    duplicates,
    totalAdded: results.reduce((s, r) => s + r.added, 0),
  });
}
