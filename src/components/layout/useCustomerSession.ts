'use client';

import { useEffect, useState } from 'react';

export type CustomerSessionState = 'loading' | 'guest' | 'authed';

/**
 * Resolves the customer session once per mount via /api/v1/auth/me.
 * 'loading' until the cookie check completes — callers render neutral
 * fallbacks (e.g. login link) until 'authed', never private UI.
 */
export function useCustomerSession(): CustomerSessionState {
  const [state, setState] = useState<CustomerSessionState>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { customer: null }))
      .then((data: { customer?: unknown }) => {
        if (!cancelled) setState(data.customer ? 'authed' : 'guest');
      })
      .catch(() => {
        if (!cancelled) setState('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
