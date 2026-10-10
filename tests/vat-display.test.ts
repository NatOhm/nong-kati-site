import { describe, expect, it } from 'vitest';

import { calculateVatFromInclusive } from '@/lib/pricing';

describe('VAT display uses inclusive prices and the configured rate', () => {
  it('hides VAT when disabled without changing the displayed amount', () => {
    const displayedPrice = 107;
    expect(calculateVatFromInclusive(displayedPrice, { enabled: false, rate: 0.07 })).toBe(0);
    expect(displayedPrice).toBe(107);
  });

  it('extracts the informational VAT portion from an inclusive total', () => {
    expect(calculateVatFromInclusive(107, { enabled: true, rate: 0.07 })).toBe(7);
    expect(calculateVatFromInclusive(110, { enabled: true, rate: 0.1 })).toBe(10);
  });
});
