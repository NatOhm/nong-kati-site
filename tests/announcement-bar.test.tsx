// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { AnnouncementBar } from '@/components/home/AnnouncementBar';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // The JSX transform in this repo emits classic React.createElement calls.
  (globalThis as { React?: typeof React }).React = React;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('AnnouncementBar', () => {
  it('appears once the enabled announcement arrives', async () => {
    // Regression: the bar used to latch `isVisible = false` in a mount effect,
    // because the first render still holds the disabled fallback and the admin
    // value only arrives from /api/v1/announcement a tick later. Nothing ever
    // set it back, so a saved announcement was never shown to anybody.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'โปรทดสอบประกาศ', href: null, enabled: true }),
    });

    render(<AnnouncementBar />);

    expect(await screen.findByText('โปรทดสอบประกาศ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ปิดประกาศ' })).toBeTruthy();
  });

  it('stays hidden while the announcement is disabled', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'ซ่อนอยู่', href: null, enabled: false }),
    });

    const { container } = render(<AnnouncementBar />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.textContent).not.toContain('ซ่อนอยู่');
  });
});
