/**
 * POST /api/v1/admin/hero-slides — the focal point must not block creation.
 *
 * `settings → แบนเนอร์หน้าแรก → เพิ่มสไลด์` has been answering 400
 * `INVALID_IMAGE_FOCUS` since 01d8da1 (2026-10-06) added the crop focal point:
 * the panel's own create request sends `{ imageUrl, alt, sortOrder }` with no
 * `imageFocus` key at all, and `parseFocus` treated the missing key as a
 * malformed value instead of "not supplied". A missing key means centred
 * (null in the DB, the same meaning every pre-existing slide already had), so
 * it must be accepted; a string that is not `"X% Y%"` must still be refused,
 * because the value lands in a `style` attribute.
 *
 * No suite covered this route before, so the regression shipped green.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  allowed: true,
  prisma: { heroSlide: { create: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: () => 'admin-token' }));
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () =>
    h.allowed
      ? { allowed: true, payload: { sub: 'admin-1', email: 'admin@test.local', perms: [] } }
      : { allowed: false, error: 'FORBIDDEN' },
  ),
}));

type Body = Record<string, unknown>;

async function post(body: Body): Promise<{ status: number; body: Body }> {
  const mod = (await import('../src/app/api/v1/admin/hero-slides/route')) as {
    POST: (r: NextRequest) => Promise<Response>;
  };
  const req = new NextRequest('http://localhost/api/v1/admin/hero-slides', {
    method: 'POST',
    headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await mod.POST(req);
  return { status: res.status, body: (await res.json()) as Body };
}

beforeEach(() => {
  h.allowed = true;
  h.prisma.heroSlide.create.mockReset();
  h.prisma.heroSlide.create.mockImplementation(async ({ data }: { data: Body }) => ({
    id: 'slide-1',
    ...data,
  }));
});

describe('POST /api/v1/admin/hero-slides — focal point', () => {
  it('creates the slide when the request omits imageFocus (เพิ่มสไลด์, the real panel body)', async () => {
    const res = await post({
      imageUrl: '/uploads/banners/2026/banner.webp',
      alt: 'แบนเนอร์โปรโมชั่น',
      sortOrder: 0,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.prisma.heroSlide.create).toHaveBeenCalledTimes(1);
    const call = h.prisma.heroSlide.create.mock.calls[0]![0] as { data: Body };
    expect(call.data['imageFocus']).toBeNull();
    expect(call.data['imageUrl']).toBe('/uploads/banners/2026/banner.webp');
  });

  it('still refuses a focal point that is not "X% Y%"', async () => {
    const res = await post({
      imageUrl: '/uploads/banners/2026/banner.webp',
      imageFocus: 'abc',
    });

    expect(res.status).toBe(400);
    expect(res.body['error']).toBe('INVALID_IMAGE_FOCUS');
    expect(h.prisma.heroSlide.create).not.toHaveBeenCalled();
  });
});
