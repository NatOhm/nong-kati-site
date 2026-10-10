'use client';

import { useEffect, useState } from 'react';

export interface StoreVatConfig {
  enabled: boolean;
  rate: number;
}

/** Fetches public VAT display settings; checkout totals are still server-authoritative. */
export function useVatConfig(): StoreVatConfig {
  const [config, setConfig] = useState<StoreVatConfig>({ enabled: false, rate: 0 });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/orders/vat')
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { enabled?: boolean; rate?: number } | null) => {
        if (!cancelled && value) {
          setConfig({ enabled: value.enabled === true, rate: Number(value.rate) || 0 });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return config;
}
