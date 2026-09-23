'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The admin-uploaded mascot image URL (from the `appearance` site setting),
 * or null when the built-in clay hamster should render. Provided once from
 * the root layout (server reads the cached appearance row) so every
 * SiteMascot on any page — including client components — can resolve it
 * without extra fetches.
 */
const MascotContext = createContext<string | null>(null);

export function MascotProvider({
  mascotUrl,
  children,
}: {
  mascotUrl: string | null;
  children: ReactNode;
}): React.JSX.Element {
  return <MascotContext.Provider value={mascotUrl}>{children}</MascotContext.Provider>;
}

export function useMascotUrl(): string | null {
  return useContext(MascotContext);
}
