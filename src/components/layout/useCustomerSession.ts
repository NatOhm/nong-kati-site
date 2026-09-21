'use client';

/**
 * Session state for the storefront chrome (navbar, bottom nav, profile menu,
 * wishlist hearts). Now a thin alias over the app-wide
 * CustomerProfileProvider (mounted in the root layout) — all consumers share
 * the ONE /api/v1/auth/me request instead of firing one per mount. Consumers
 * needing the full profile should use useCustomerProfile() directly.
 */

import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';

export type CustomerSessionState = 'loading' | 'guest' | 'authed';

export function useCustomerSession(): CustomerSessionState {
  return useCustomerProfile().state;
}
