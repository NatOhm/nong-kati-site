/**
 * Unit tests for the shared same-origin redirect sanitizer (audit [Low]).
 * Run: npx vitest run
 */
import { describe, expect, it } from 'vitest';

import { safeRedirect } from '@/lib/safeRedirect';

describe('safeRedirect', () => {
  it('accepts ordinary relative paths', () => {
    expect(safeRedirect('/account/dashboard', '/x')).toBe('/account/dashboard');
    expect(safeRedirect('/search?q=netflix', '/x')).toBe('/search?q=netflix');
  });

  it('falls back on empty/null/undefined', () => {
    expect(safeRedirect(null, '/fallback')).toBe('/fallback');
    expect(safeRedirect(undefined, '/fallback')).toBe('/fallback');
    expect(safeRedirect('', '/fallback')).toBe('/fallback');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirect('//evil.example.com', '/safe')).toBe('/safe');
  });

  it('rejects backslash tricks (audit [Low] primary case)', () => {
    // Browsers normalise /\evil.example.com to a different host.
    expect(safeRedirect('/\\evil.example.com', '/safe')).toBe('/safe');
    expect(safeRedirect('/\\evil.example.com', '/safe')).not.toContain('evil');
    expect(safeRedirect('\\\\evil.example.com', '/safe')).toBe('/safe');
    expect(safeRedirect('/path\\evil', '/safe')).toBe('/safe');
  });

  it('rejects control characters', () => {
    expect(safeRedirect('/account\u0000', '/safe')).toBe('/safe');
    expect(safeRedirect('/account\r\nInject: 1', '/safe')).toBe('/safe');
  });

  it('rejects absolute URLs and non-path schemes', () => {
    expect(safeRedirect('https://evil.example.com', '/safe')).toBe('/safe');
    expect(safeRedirect('javascript:alert(1)', '/safe')).toBe('/safe');
    expect(safeRedirect('account/dashboard', '/safe')).toBe('/safe');
  });

  it('caps path length', () => {
    expect(safeRedirect(`/${'a'.repeat(600)}`, '/safe')).toBe('/safe');
  });
});
