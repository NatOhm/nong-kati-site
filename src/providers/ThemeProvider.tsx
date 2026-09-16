'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
});

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Fallback when nothing is stored and no system preference exists. */
  defaultTheme?: Theme;
}

const STORAGE_KEY = 'nk-theme';

function resolveStoredTheme(fallback: Theme): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* private mode / storage blocked — fall through */
  }
  return fallback;
}

export function ThemeProvider({
  children,
  defaultTheme = 'light',
}: ThemeProviderProps): React.JSX.Element {
  // First render must match the server exactly (defaultTheme) to avoid a hydration
  // mismatch; the no-FOUC inline script already painted the correct colors, and the
  // mount effect below adopts the real theme (state + toggle icon) right after.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    // Reconcile: the inline script already applied the right theme; adopt it.
    const resolved = resolveStoredTheme(defaultTheme);
    setThemeState(resolved);
    document.documentElement.setAttribute('data-theme', resolved);

    // Follow OS changes only while the user has no explicit choice.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent): void => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored !== 'dark' && stored !== 'light') {
        const next = e.matches ? 'dark' : 'light';
        setThemeState(next);
        document.documentElement.setAttribute('data-theme', next);
      }
    };
    mq.addEventListener('change', onSystemChange);

    // Keep tabs in sync (localStorage event fires in *other* tabs).
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue);
        document.documentElement.setAttribute('data-theme', e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (next: Theme): void => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-theme', next);
  };

  const toggle = (): void => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
