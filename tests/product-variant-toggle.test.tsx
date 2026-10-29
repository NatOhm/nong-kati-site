// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/layout/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/feedback/DeleteConfirmDialog', () => ({
  DeleteConfirmDialog: () => null,
  useDeleteFlow: () => ({ busy: false, target: null }),
}));
vi.mock('../src/app/management/products/ImportDialog', () => ({ ImportDialog: () => null }));
vi.mock('../src/app/management/products/BulkPricingDialog', () => ({
  BulkPricingDialog: () => null,
}));
vi.mock('../src/app/management/products/BulkStockDialog', () => ({ BulkStockDialog: () => null }));
vi.mock('../src/app/management/inventory/VariantCodesDialog', () => ({
  VariantCodesDialog: () => null,
}));
vi.mock('@/api/adminCatalog', () => ({ adminDeleteProductPermanent: vi.fn() }));

const adminFetch = vi.fn();

vi.mock('@/lib/adminSession', () => ({
  adminFetch: (...args: unknown[]) => adminFetch(...args),
}));

import AdminProductsPage from '../src/app/management/products/page';

const CLOSED_VARIANT_PRODUCT = {
  id: 'p1',
  name: 'เน็ตฟลิกซ์พรีเมียม',
  slug: 'netflix-premium',
  description: null,
  shortDescription: null,
  imageUrl: null,
  categoryId: 'c1',
  categoryName: 'สตรีมมิง',
  isActive: true,
  isFeatured: false,
  tags: [],
  variants: [
    {
      id: 'v-closed',
      label: '7 วัน',
      price: 32,
      cost: null,
      memberPrice: null,
      dealerPrice: null,
      stock: 10,
      isActive: false,
      sortOrder: 0,
    },
  ],
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { React?: typeof React }).React = React;
  adminFetch.mockImplementation(async (u: unknown) => {
    if (u === '/api/v1/admin/products')
      return { ok: true, json: async () => [CLOSED_VARIANT_PRODUCT] };
    if (u === '/api/v1/admin/categories')
      return { ok: true, json: async () => ({ categories: [{ id: 'c1', name: 'สตรีมมิง' }] }) };
    if (u === '/api/v1/admin/tags') return { ok: true, json: async () => ({ tags: [] }) };
    throw new Error(`unexpected fetch ${String(u)}`);
  });
});

describe('package editor เปิด/ปิด switch (Fix B)', () => {
  it('flips a ปิด row to เปิด and saves isActive:true for that variant id', async () => {
    let putBody: Record<string, unknown> | null = null;
    adminFetch.mockImplementation(async (u: unknown, init?: { method?: string; body?: string }) => {
      if (u === '/api/v1/admin/products')
        return { ok: true, json: async () => [CLOSED_VARIANT_PRODUCT] };
      if (u === '/api/v1/admin/categories')
        return { ok: true, json: async () => ({ categories: [{ id: 'c1', name: 'สตรีมมิง' }] }) };
      if (u === '/api/v1/admin/tags') return { ok: true, json: async () => ({ tags: [] }) };
      if (u === '/api/v1/admin/products/p1' && init?.method === 'PUT') {
        putBody = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`unexpected fetch ${String(u)}`);
    });

    render(<AdminProductsPage />);

    // Open the editor drawer for the product.
    fireEvent.click(await screen.findByRole('button', { name: 'แก้ไข เน็ตฟลิกซ์พรีเมียม' }));

    // The stored-closed row renders a ปิด switch (aria-pressed=false).
    // (Matched by title: the drawer's overlay backdrop shares the name ปิด.)
    const toggle = await screen.findByTitle('ปิดจำหน่ายอยู่ — กดเพื่อเปิดขายอีกครั้ง');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    // Clicking flips the draft to เปิด without touching anything else.
    fireEvent.click(toggle);
    const flipped = await screen.findByTitle('กำลังขายอยู่ — กดเพื่อปิดจำหน่าย (ซ่อนจากหน้าเว็บ)');
    expect(flipped.getAttribute('aria-pressed')).toBe('true');
    expect(flipped.textContent).toBe('เปิด');

    // Save sends the flipped flag with the existing variant id (in-place
    // update, not delete-and-recreate).
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    await waitFor(() => expect(putBody).not.toBeNull());
    const variants = (putBody as unknown as { variants: { id?: string; isActive: boolean }[] })
      .variants;
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ id: 'v-closed', isActive: true });
  });
});
