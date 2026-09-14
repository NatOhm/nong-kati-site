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
      <div className="mx-auto flex max-w-[1440px]">
        {/* Left sidebar - fixed on desktop, drawer on mobile */}
        <FacebookSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </>
  );
}
