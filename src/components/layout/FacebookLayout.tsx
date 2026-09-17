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
        <main className="relative min-w-0 flex-1 bg-surface-base pb-16 lg:pb-0">
          <HamsterGrassScene />
          <div className="relative mx-auto max-w-[1440px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </>
  );
}
