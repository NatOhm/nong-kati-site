// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SlipUploadPanel } from '@/components/checkout/SlipUploadPanel';

function stubBlobUrls(): void {
  // jsdom cannot build object URLs from its own File/Blob shims (vitest's
  // compat polyfill expects node Buffers) — the panel only needs a string.
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:preview',
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
}

type FetchCall = [url: string, init?: RequestInit];
const fetchMock = vi.fn();

function pickAndSubmit(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['slip-bytes'], 'slip.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /ตรวจสลิป|ส่งสลิปให้แอดมิน/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubBlobUrls();
  // The JSX transform in this repo emits classic React.createElement calls.
  (globalThis as { React?: typeof React }).React = React;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('SlipUploadPanel — auto verify with admin fallback', () => {
  it('keeps the auto-verify reason and reports the slip went to the admin (no duplicate upload when stored)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'AMOUNT_MISMATCH',
        message: 'ยอดโอนในสลิปไม่ตรงกับยอดสั่งซื้อ',
        slipStored: true,
      }),
    });
    const onConfirmed = vi.fn();
    render(
      <SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled onConfirmed={onConfirmed} />,
    );
    pickAndSubmit();

    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('ยอดโอนในสลิปไม่ตรงกับยอดสั่งซื้อ');
    expect(box.textContent).toContain('แอดมิน');
    // The server already stored the image — exactly one request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[0]![0]).toContain('/api/v1/payments/slip-verify');
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('uploads the slip for manual review when the server never stored it', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'SLIP_VERIFY_UNAVAILABLE', slipStored: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'slip_received', message: 'ได้รับสลิปแล้ว' }),
      });
    render(<SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled />);
    pickAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[1]![0]).toContain('/api/v1/payments/slip-upload');
    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('แอดมิน');
  });

  it('fires onConfirmed when the bank check passes so the page can flip to the paid state', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'confirmed',
        message: 'ตรวจสลิปผ่าน — ระบบกำลังจัดส่งโค้ดให้ทางอีเมล',
      }),
    });
    const onConfirmed = vi.fn();
    render(
      <SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled onConfirmed={onConfirmed} />,
    );
    pickAndSubmit();

    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('ตรวจสลิปผ่าน');
    expect(onConfirmed).toHaveBeenCalledWith('confirmed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('goes straight to the admin when auto verification is off', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'slip_received', message: 'ได้รับสลิปแล้ว' }),
    });
    render(<SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled={false} />);
    pickAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[0]![0]).toContain('/api/v1/payments/slip-upload');
    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('ได้รับสลิปแล้ว');
  });
});