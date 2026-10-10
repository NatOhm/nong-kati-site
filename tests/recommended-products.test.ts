import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { product: { findMany: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { getFeaturedProducts } from '@/lib/data';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.product.findMany.mockResolvedValue([]);
});

describe('admin-curated recommended products', () => {
  it('only loads active products explicitly marked featured', async () => {
    await expect(getFeaturedProducts()).resolves.toEqual([]);

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isFeatured: true, isActive: true },
      include: expect.objectContaining({
        category: expect.any(Object),
        variants: expect.any(Object),
      }),
    }));
  });
});
