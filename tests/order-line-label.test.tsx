// @vitest-environment jsdom
/**
 * Order lines must name the package instead of printing "1 × 2".
 *
 * Client report 2026-11-13 ("แสดงออเด้อยังไม่หาย … ไม่รู้ว่ารายการไหนคือของอันไหน"):
 * an order with two lines of the same product rendered as "1 × 2" and "2 × 3",
 * because every order screen printed `{skuCode} × {quantity}` and
 * `OrderItem.skuCode` actually holds the variant label snapshot.
 */
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OrderDetailCard } from '@/components/order/OrderDetailCard';
import { formatOrderLineDetail, orderLineOptionLabel } from '@/lib/orderLineLabel';

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
});

describe('formatOrderLineDetail', () => {
  it('L1 names the package and names the quantity', () => {
    expect(formatOrderLineDetail('1', 3)).toBe('แพ็กเกจ 1 · จำนวน 3');
    expect(formatOrderLineDetail('เมลร้าน', 2)).toBe('แพ็กเกจ เมลร้าน · จำนวน 2');
  });

  it('L2 falls back to a bare quantity when the product has no package', () => {
    expect(formatOrderLineDetail('', 2)).toBe('จำนวน 2');
    expect(formatOrderLineDetail(null, 1)).toBe('จำนวน 1');
    expect(formatOrderLineDetail(undefined, 5)).toBe('จำนวน 5');
    expect(formatOrderLineDetail('  default ', 4)).toBe('จำนวน 4');
  });

  it('L3 trims padding but never rewrites a real label', () => {
    expect(orderLineOptionLabel(' 2 ')).toBe('2');
    expect(orderLineOptionLabel('')).toBe('');
    expect(orderLineOptionLabel(undefined)).toBe('');
  });
});

describe('OrderDetailCard', () => {
  it('L4 two lines of the same product stay distinguishable', () => {
    render(
      <OrderDetailCard
        order={{
          id: 'o1',
          orderNumber: 'NK-2026-000203',
          status: 'pending_payment',
          createdAt: '2026-11-13T07:00:00.000Z',
          items: [
            {
              productNameTh: 'Microsoft 365 30 วัน',
              skuCode: 'เมลร้าน',
              denominationThb: 50,
              quantity: 2,
              lineTotalThb: 100,
            },
            {
              productNameTh: 'Microsoft 365 30 วัน',
              skuCode: 'เมลลูกค้า',
              denominationThb: 50,
              quantity: 3,
              lineTotalThb: 150,
            },
          ],
          codes: [],
          subtotalThb: 250,
          vatAmountThb: 0,
          vatEnabled: false,
          vatRate: 0,
          totalAmountThb: 250,
          customerEmail: 'customer@example.com',
        }}
      />,
    );

    expect(screen.getAllByText('Microsoft 365 30 วัน')).toHaveLength(2);
    expect(screen.getByText('แพ็กเกจ เมลร้าน · จำนวน 2')).toBeTruthy();
    expect(screen.getByText('แพ็กเกจ เมลลูกค้า · จำนวน 3')).toBeTruthy();
  });
});
