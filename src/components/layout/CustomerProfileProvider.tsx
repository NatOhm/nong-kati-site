'use client';

/**
 * Shared customer profile for /account/* — one /api/v1/auth/me request per
 * layout mount instead of one per page (review: the layout's session check
 * discarded the customer payload while settings refetched it). Lives above
 * the guard so pages consume `profile` straight from context; after a PATCH,
 * pages call `setProfile` so the whole tree (sidebar greeting, settings)
 * stays in sync without a refetch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface CustomerProfile {
  id: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  marketingOptIn: boolean;
}

export type CustomerSessionState = 'loading' | 'guest' | 'authed';

interface CustomerProfileContextValue {
  profile: CustomerProfile | null;
  state: CustomerSessionState;
  /** Replace the cached profile after a successful save (no refetch). */
  setProfile: (p: CustomerProfile) => void;
  /** Re-run /api/v1/auth/me (retry after load failure, post-login refresh). */
  reload: () => Promise<CustomerProfile | null>;
}

const CustomerProfileContext = createContext<CustomerProfileContextValue | null>(null);

export function CustomerProfileProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [profile, setProfileState] = useState<CustomerProfile | null>(null);
  const [state, setState] = useState<CustomerSessionState>('loading');
  const inFlight = useRef<Promise<CustomerProfile | null> | null>(null);

  const fetchMe = useCallback(async (): Promise<CustomerProfile | null> => {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      const data = (await res.json()) as { customer?: CustomerProfile | null };
      const customer = res.ok ? (data.customer ?? null) : null;
      setProfileState(customer);
      setState(customer ? 'authed' : 'guest');
      return customer;
    } catch {
      setProfileState(null);
      setState('guest');
      return null;
    }
  }, []);

  const setProfile = useCallback((p: CustomerProfile) => {
    setProfileState(p);
  }, []);

  const reload = useCallback(async (): Promise<CustomerProfile | null> => {
    // Deduplicate concurrent calls (multiple consumers mounting in the same
    // tick, or React StrictMode's double-invoked effects in dev).
    inFlight.current ??= fetchMe().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [fetchMe]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ profile, state, setProfile, reload }),
    [profile, state, setProfile, reload],
  );

  return <CustomerProfileContext.Provider value={value}>{children}</CustomerProfileContext.Provider>;
}

export function useCustomerProfile(): CustomerProfileContextValue {
  const ctx = useContext(CustomerProfileContext);
  if (!ctx) {
    throw new Error('useCustomerProfile must be used inside CustomerProfileProvider');
  }
  return ctx;
}
