'use client';

import { useState } from 'react';
import { FacebookNavbar } from './FacebookNavbar';
import { FacebookSidebar } from './FacebookSidebar';
import { PageTransition } from './PageTransition';
import { AnnouncementBar } from '@/components/home/AnnouncementBar';
import { HamsterGrassScene } from '@/components/home/HamsterGrassScene';

interface FacebookLayoutProps {
  children: React.ReactNode;
}

/**
 * Storefront chrome shared by every public page: announcement strip,
 * Facebook-style navbar with clay hamster logo, sidebar, and the grass
 * scene with a 550ms ease-out page transition.
 *
 * The layout is a client component, so it cannot fetch the announcement
 * server-side; the bar hydrates from the API on mount. Pages that already
 * render <AnnouncementBar initial={...}> server-side pass the DB value down
 * through context-free duplication (the bar ignores a second mount's fetch).
 */
export function FacebookLayout({ children }: FacebookLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Skip link — first focusable element (audit #4).
          2026-10-14: `focus:` → `focus-visible:` — a plain `:focus` reveal
          pops this pill out over the navbar logo on touch taps / screen-reader
          exploration / restored focus ("appears in a weird way"), which is
          never useful to a touch user. Keyboard Tab still reveals it
          (focus-visible matches), and it now renders `fixed` below the sticky
          navbar at any scroll depth instead of covering the logo at top-left. */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-20 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-peach-700 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-clay"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      {/* Announcement strip — admin-editable via /management/settings */}
      <AnnouncementBar />

      {/* Top navigation */}
      <FacebookNavbar onMenuToggle={() => setSidebarOpen(true)} />

      {/* Main content area with sidebar */}
      <div className="flex">
        {/* Left sidebar - fixed on desktop, drawer on mobile */}
        <FacebookSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content - centered in the remaining space, with a clay grass-field
            scene under the content and a 550ms ease-out transition on navigation */}
        {/* tabIndex={-1} makes the landmark focusable so fragment navigation
            from the skip link actually moves keyboard focus there (SPA jumps
            don't do it on their own). */}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative min-w-0 flex-1 bg-surface-base pb-16 outline-none lg:pb-0"
        >
          <HamsterGrassScene />
          <div className="relative mx-auto max-w-[1440px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </>
  );
}
