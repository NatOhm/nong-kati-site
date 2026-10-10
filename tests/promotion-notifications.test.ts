import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    coupon: { findMany: vi.fn() },
    promotion: { findMany: vi.fn() },
    notificationRead: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/api/customerAuth', () => ({ getCustomerFromToken: vi.fn(async () => null) }));

import { GET } from '@/app/api/v1/notifications/route';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.coupon.findMany.mockResolvedValue([]);
  prismaMock.promotion.findMany.mockResolvedValue([]);
  prismaMock.notificationRead.findMany.mockResolvedValue([]);
});

describe('customer promotion notifications', () => {
  it('includes discount, applicable products, conditions, expiry, description, and product links', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000);
    prismaMock.promotion.findMany.mockResolvedValue([{
      id: 'promo-1',
      name: 'โปรเกม',
      description: 'เฉพาะสัปดาห์นี้',
      discountType: 'percent',
      discountValue: 15,
      scope: 'selected',
      products: [
        { product: { name: 'Game A', slug: 'game-a' } },
        { product: { name: 'Game B', slug: 'game-b' } },
      ],
      minSpendThb: 500,
      expiresAt,
    }]);

    const response = await GET(new NextRequest('http://localhost/api/v1/notifications'));
    const payload = await response.json() as {
      items: Array<{ title: string; body: string; expiresAt: string; links: Array<{ label: string; href: string }> }>;
    };

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      title: 'ส่วนลดอัตโนมัติ: โปรเกม',
      body: expect.stringContaining('ลด 15% สำหรับ สินค้า: Game A, Game B (ขั้นต่ำ 500฿) — เฉพาะสัปดาห์นี้'),
      expiresAt: expiresAt.toISOString(),
      links: [
        { label: 'Game A', href: '/product/game-a' },
        { label: 'Game B', href: '/product/game-b' },
      ],
    });
  });

  it('links shop-wide promotions to the complete catalog', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([{
      id: 'promo-all', name: 'ร้านทั้งร้าน', description: null,
      discountType: 'amount', discountValue: 10, scope: 'all', products: [],
      minSpendThb: null, expiresAt: null,
    }]);

    const response = await GET(new NextRequest('http://localhost/api/v1/notifications'));
    const payload = await response.json() as { items: Array<{ links: Array<{ label: string; href: string }> }> };
    expect(payload.items[0]?.links).toEqual([{ label: 'ดูสินค้าทั้งหมด', href: '/search' }]);
  });
});
