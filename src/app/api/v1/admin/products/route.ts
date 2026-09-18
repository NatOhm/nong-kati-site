import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/products — full catalog for the admin table (products:read).
 * Includes inactive products and archives; ordered newest first.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      variants: p.variants.map((v) => ({
        id: v.id,
        label: v.label,
        price: Number(v.price),
        stock: v.stock,
        isActive: v.isActive,
        sortOrder: v.sortOrder,
      })),
      createdAt: p.createdAt.toISOString(),
    })),
  );
}

interface VariantInput {
  label?: unknown;
  price?: unknown;
  stock?: unknown;
  cost?: unknown;
  isActive?: unknown;
}

/** Validate a variant payload; returns null when the shape is wrong. */
function parseVariant(
  v: VariantInput,
): { label: string; price: number; stock: number; cost: number | null; isActive: boolean } | null {
  if (typeof v.label !== 'string' || v.label.trim() === '') return null;
  const price = typeof v.price === 'number' ? v.price : NaN;
  const stock = typeof v.stock === 'number' ? v.stock : NaN;
  if (!Number.isFinite(price) || price < 0) return null;
  if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) return null;
  // ต้นทุนต่อชิ้น (รายงานกำไร) — ไม่กรอกได้ (null)
  let cost: number | null = null;
  if (v.cost !== null && v.cost !== undefined && v.cost !== '') {
    cost = Number(v.cost);
    if (!Number.isFinite(cost) || cost < 0) return null;
  }
  return { label: v.label.trim(), price, stock, cost, isActive: v.isActive !== false };
}

/**
 * POST /api/v1/admin/products — create a product with variants (products:write).
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
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
  if (!name) return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });

  const categoryId = typeof b['categoryId'] === 'string' ? b['categoryId'] : '';
  if (!categoryId) return NextResponse.json({ error: 'CATEGORY_REQUIRED' }, { status: 400 });
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ error: 'CATEGORY_NOT_FOUND' }, { status: 400 });

  const slugBase =
    typeof b['slug'] === 'string' && b['slug'].trim() !== ''
      ? b['slug'].trim()
      : name
          .toLowerCase()
          .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'product';
  const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

  const description = typeof b['description'] === 'string' ? b['description'] : null;
  const imageUrl =
    typeof b['imageUrl'] === 'string' && b['imageUrl'].startsWith('/') ? b['imageUrl'] : null;
  const isFeatured = b['isFeatured'] === true;

  if (!Array.isArray(b['variants']) || b['variants'].length === 0) {
    return NextResponse.json({ error: 'VARIANTS_REQUIRED' }, { status: 400 });
  }
  const variants = (b['variants'] as VariantInput[]).map(parseVariant);
  if (variants.some((v) => v === null)) {
    return NextResponse.json({ error: 'INVALID_VARIANT' }, { status: 400 });
  }

  const created = await prisma.product.create({
    data: {
      name,
      slug,
      sku: typeof b['sku'] === 'string' && b['sku'].trim() !== '' ? b['sku'].trim() : null,
      description,
      imageUrl,
      categoryId,
      isFeatured,
      variants: {
        create: variants.map((v, i) => ({
          label: v!.label,
          price: v!.price,
          stock: v!.stock,
          costThb: v!.cost,
          isActive: v!.isActive,
          sortOrder: i,
        })),
      },
    },
    include: { variants: true },
  });

  return NextResponse.json({ id: created.id, slug: created.slug }, { status: 201 });
}
