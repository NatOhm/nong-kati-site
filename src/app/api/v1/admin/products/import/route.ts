/**
 * POST /api/v1/admin/products/import — bulk product upload (products:write).
 *
 * Body: { csv: string, categoryId?: string, mode?: 'upsert' | 'create-only' }
 *
 * CSV columns (header required, Thai or English names accepted):
 *   sku,name,category,price,stock,cost,description
 *   - sku      required, unique — the upsert key
 *   - name     required
 *   - category optional when categoryId is provided in the body; accepts
 *              category slug or name (leaf categories preferred)
 *   - price    required number (THB) — creates one variant with this price
 *   - stock    optional integer (default 0)
 *   - cost     optional number (THB) — stored as variant costThb
 *   - description optional
 *
 * Rows are processed sequentially; each row is its own transaction so one
 * bad row never blocks the rest. Every row that creates or restocks writes
 * a StockMove (reason 'import', refType 'csv') for the audit trail.
 * Response: per-row results with row numbers, so the UI can show exactly
 * what was created, updated, or rejected and why.
 */

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

type Row = Record<string, string>;

/** Split a single CSV line respecting double-quoted cells. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Normalize Thai/English header names to canonical column keys. */
function headerKey(raw: string): string | null {
  const h = raw.toLowerCase().replace(/\s+/g, '');
  if (h === 'sku' || h === 'รหัสสินค้า') return 'sku';
  if (h === 'name' || h === 'ชื่อ' || h === 'ชื่อสินค้า') return 'name';
  if (h === 'category' || h === 'หมวดหมู่' || h === 'หมวด') return 'category';
  if (h === 'price' || h === 'ราคา') return 'price';
  if (h === 'stock' || h === 'สต๊อก' || h === 'สต็อก') return 'stock';
  if (h === 'cost' || h === 'ต้นทุน') return 'cost';
  if (h === 'description' || h === 'คำอธิบาย' || h === 'รายละเอียด') return 'description';
  return null;
}

function parseCsv(text: string): { header: Row; rows: Row[] } | { error: string } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'CSV_EMPTY' };

  const headerCells = splitCsvLine(lines[0]!);
  const keys = headerCells.map(headerKey);
  if (keys.some((k) => k === null)) {
    return {
      error: `CSV_BAD_HEADER: ${headerCells.filter((_, i) => keys[i] === null).join(', ')}`,
    };
  }
  if (!keys.includes('sku') || !keys.includes('name') || !keys.includes('price')) {
    return { error: 'CSV_MISSING_REQUIRED_COLUMNS' };
  }

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: Row = {};
    keys.forEach((k, i) => {
      if (k) row[k] = cells[i] ?? '';
    });
    rows.push(row);
  }
  const header: Row = {};
  keys.forEach((k, i) => {
    if (k) header[k] = headerCells[i] ?? '';
  });
  return { header, rows };
}

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
  const b = body as Record<string, unknown>;
  const csv = typeof b['csv'] === 'string' ? b['csv'] : '';
  if (!csv.trim()) return NextResponse.json({ error: 'CSV_REQUIRED' }, { status: 400 });
  const mode = b['mode'] === 'create-only' ? 'create-only' : 'upsert';
  const bodyCategoryId = typeof b['categoryId'] === 'string' ? b['categoryId'] : '';

  // Category map for resolving per-row category slugs/names.
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true },
  });
  const catByKey = new Map<string, string>();
  for (const c of categories) {
    catByKey.set(c.slug.toLowerCase(), c.id);
    catByKey.set(c.name.toLowerCase(), c.id);
  }
  const fallbackCategoryId = bodyCategoryId || (categories.length === 1 ? categories[0]!.id : '');

  const parsed = parseCsv(csv);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: 'TOO_MANY_ROWS', maxRows: MAX_ROWS }, { status: 400 });
  }

  const results: {
    row: number;
    status: 'created' | 'updated' | 'error';
    sku?: string | undefined;
    slug?: string | undefined;
    message?: string | undefined;
  }[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const rowNum = i + 2; // +2: 1-based lines and the header line
    const sku = row['sku'] ?? '';
    const name = row['name'] ?? '';
    const price = Number(row['price']?.replace(/,/g, ''));
    const stock = row['stock'] ? Math.max(0, Math.trunc(Number(row['stock']))) : 0;
    const cost = row['cost'] ? Number(row['cost']?.replace(/,/g, '')) : null;

    try {
      if (!sku) throw new Error('SKU_REQUIRED');
      if (!name) throw new Error('NAME_REQUIRED');
      if (!Number.isFinite(price) || price <= 0) throw new Error('PRICE_INVALID');

      const categoryId = catByKey.get((row['category'] ?? '').toLowerCase()) ?? fallbackCategoryId;
      if (!categoryId) throw new Error('CATEGORY_REQUIRED');

      const existing = await prisma.product.findUnique({
        where: { sku },
        include: { variants: { orderBy: { sortOrder: 'asc' } } },
      });

      if (existing) {
        if (mode === 'create-only') {
          results.push({ row: rowNum, status: 'error', sku, message: 'SKU_ALREADY_EXISTS' });
          continue;
        }
        // Update: name/desc always; first variant price/cost; stock = max(existing, csv) delta via move.
        const first = existing.variants[0];
        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: existing.id },
            data: { name, description: row['description'] || existing.description },
          });
          if (first) {
            const delta = stock - first.stock;
            await tx.productVariant.update({
              where: { id: first.id },
              data: {
                price,
                ...(cost !== null ? { costThb: cost } : {}),
                ...(delta !== 0 ? { stock: first.stock + delta } : {}),
              },
            });
            if (delta !== 0) {
              await tx.stockMove.create({
                data: {
                  variantId: first.id,
                  delta,
                  reason: 'import',
                  refType: 'csv',
                  refId: sku,
                  stockAfter: first.stock + delta,
                  actorId: check.payload?.sub ?? null,
                },
              });
            }
          } else {
            await tx.productVariant.create({
              data: {
                productId: existing.id,
                label: 'มาตรฐาน',
                price,
                stock,
                costThb: cost,
                isActive: true,
                sortOrder: 0,
              },
            });
          }
        });
        updated++;
        results.push({ row: rowNum, status: 'updated', sku, slug: existing.slug });
      } else {
        // Create: slug derived from name (unique suffix like single-create).
        const slugBase =
          name
            .toLowerCase()
            .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'product';
        const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}${i.toString(36)}`;
        const product = await prisma.product.create({
          data: {
            name,
            slug,
            sku,
            description: row['description'] || null,
            categoryId,
            variants: {
              create: {
                label: 'มาตรฐาน',
                price,
                stock,
                costThb: cost,
                isActive: true,
                sortOrder: 0,
              },
            },
          },
        });
        if (stock > 0) {
          await prisma.stockMove.create({
            data: {
              variantId: (
                await prisma.productVariant.findFirstOrThrow({
                  where: { productId: product.id },
                  orderBy: { sortOrder: 'asc' },
                })
              ).id,
              delta: stock,
              reason: 'import',
              refType: 'csv',
              refId: sku,
              stockAfter: stock,
              actorId: check.payload?.sub ?? null,
            },
          });
        }
        created++;
        results.push({ row: rowNum, status: 'created', sku, slug: product.slug });
      }
    } catch (e) {
      const code =
        e instanceof Error && /^(SKU_|NAME_|PRICE_|CATEGORY_)/.test(e.message)
          ? e.message
          : 'ROW_FAILED';
      results.push({ row: rowNum, status: 'error', sku: sku || undefined, message: code });
    }
  }

  return NextResponse.json({
    created,
    updated,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  });
}
