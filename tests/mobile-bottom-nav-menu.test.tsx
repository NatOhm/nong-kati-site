// @vitest-environment jsdom
/**
 * The phone's account button must open a menu, not navigate (2026-11-06).
 *
 * `MobileBottomNav` swaps its account tab for a chooser when an admin session
 * exists: dashboard vs the admin profile (password/2FA). The behaviour is small
 * but every part of it is easy to break silently — a menu that starts open
 * covers the page, one that never closes leaves a dead panel over the content
 * after a tap-through, and a missing `aria-expanded` tells a screen reader
 * nothing.
 *
 *   M1  closed on mount: aria-expanded="false", no menu in the tree,
 *   M2  one tap opens: aria-expanded="true" + both destinations,
 *   M3  a pathname change closes it again (tap-through / back button),
 *   M4  the dock is absent on /management, which owns its own chrome.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ pathname: '/account/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useCart', () => ({ useCart: () => ({ itemCount: 0 }) }));
vi.mock('@/components/layout/useCustomerSession', () => ({
  useCustomerSession: () => 'authed',
}));
vi.mock('@/components/layout/useAdminIdentity', () => ({
  useAdminIdentity: () => ({
    isAdmin: true,
    identity: {
      fullName: 'Oil Super',
      email: 'oil@nong-kati.test',
      role: 'super_admin',
      lastLoginAt: null,
      activeSessions: 2,
    },
  }),
  ADMIN_ROLE_LABELS: { super_admin: 'ผู้ดูแลระบบสูงสุด' },
  formatLastLogin: () => 'เมื่อสักครู่',
}));
vi.mock('@/components/search', () => ({ SearchOverlay: () => null }));

import { MobileBottomNav } from '@/components/home/MobileBottomNav';

const accountButton = () => screen.getByRole('button', { name: 'เมนูผู้ดูแลระบบ' });

beforeEach(() => {
  state.pathname = '/account/dashboard';
});

describe('MobileBottomNav — admin account chooser on the phone', () => {
  it('M1: closed on mount, with aria-expanded telling the truth', () => {
    render(<MobileBottomNav />);

    expect(accountButton().getAttribute('aria-expanded')).toBe('false');
    expect(accountButton().getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('เข้าหน้าแอดมิน')).toBeNull();
  });

  it('M2: one tap opens the menu with both destinations', () => {
    render(<MobileBottomNav />);

    fireEvent.click(accountButton());

    expect(accountButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'เมนูผู้ดูแลระบบ' })).toBeTruthy();
    expect(screen.getByText('เข้าหน้าแอดมิน')).toBeTruthy();
    expect(screen.getByText('โปรไฟล์ผู้ดูแล (รหัสผ่าน/2FA)')).toBeTruthy();
    // Identity is shown, so the operator can tell WHICH account this is.
    expect(screen.getByText(/oil@nong-kati\.test/)).toBeTruthy();
  });

  it('M3: it closes when the route changes under it', () => {
    const { rerender } = render(<MobileBottomNav />);
    fireEvent.click(accountButton());
    expect(screen.getByRole('menu')).toBeTruthy();

    // A tap on a destination (or the back button) changes the pathname; the
    // menu must not survive the navigation.
    // A storefront route, not /management: that one hides the whole dock, and
    // this test is about the menu surviving navigation.
    state.pathname = '/product/netflix-30';
    rerender(<MobileBottomNav />);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(accountButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('M4: no dock inside /management (that panel has its own chrome)', () => {
    state.pathname = '/management/orders';

    render(<MobileBottomNav />);

    expect(screen.queryByRole('button', { name: 'เมนูผู้ดูแลระบบ' })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
