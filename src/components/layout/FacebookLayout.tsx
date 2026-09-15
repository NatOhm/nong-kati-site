'use client';

import { useState } from 'react';
import { FacebookNavbar } from './FacebookNavbar';
import { FacebookSidebar } from './FacebookSidebar';

interface FacebookLayoutProps {
  children: React.ReactNode;
}

export function FacebookLayout({ children }: FacebookLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Top navigation */}
      <FacebookNavbar onMenuToggle={() => setSidebarOpen(true)} />

      {/* Main content area with sidebar */}
      <div className="flex">
        {/* Left sidebar - fixed on desktop, drawer on mobile */}
        <FacebookSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content - centered in the remaining space (add pb-16 lg:pb-0 for mobile bottom nav) */}
        <main className="min-w-0 flex-1 bg-gradient-to-b from-peach-50 to-clay-100 pb-16 lg:pb-0">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </>
  );
}
