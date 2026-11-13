'use client';

import { useEffect, useState } from 'react';

export interface StoreVatConfig {
  enabled: boolean;
  rate: number;
}

const FALLBACK: StoreVatConfig = { enabled: false, rate: 0 };

/**
 * One request for the whole page. Every product card / quick view / cart line
 * used to mount its own copy of this hook, so a catalogue page fired the same
 * GET /api/v1/orders/vat a dozen times in parallel — a dozen wasted round
 * trips before the price labels could settle (client ask 2026-11-13:
 * "ทำไงให้เว็บมันเปิดไว ๆ"). A module-level promise + result is shared by all
 * consumers; failures are not cached, so a later mount retries.
 */
let cached: StoreVatConfig | null = null;
let inflight: Promise<StoreVatConfig | null> | null = null;

function loadVatConfig(): Promise<StoreVatConfig | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/v1/orders/vat')
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { enabled?: boolean; rate?: number } | null) => {
        if (!value) return null;
        const config: StoreVatConfig = {
          enabled: value.enabled === true,
          rate: Number(value.rate) || 0,
        };
        cached = config;
        return config;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Fetches public VAT display settings; checkout totals are still server-authoritative. */
export function useVatConfig(): StoreVatConfig {
  const [config, setConfig] = useState<StoreVatConfig>(cached ?? FALLBACK);

  useEffect(() => {
    if (cached) {
      setConfig(cached);
      return;
    }
    let cancelled = false;
    void loadVatConfig().then((value) => {
      if (!cancelled && value) setConfig(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
