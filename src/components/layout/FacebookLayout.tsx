'use client';

import { useState } from 'react';
import { FacebookNavbar } from './FacebookNavbar';
import { FacebookSidebar } from './FacebookSidebar';
import { PageTransition } from './PageTransition';
import { HamsterGrassScene } from '@/components/home/HamsterGrassScene';

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
