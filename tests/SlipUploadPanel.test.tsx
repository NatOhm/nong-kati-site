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

  it('shows the product and its code right here once the slip confirms', async () => {
    // Client ask 2026-11-01: the bought product should appear on the page when
    // payment is correct and fulfilled, not only in an email.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'confirmed',
        confirmationUuid: 'cu-1',
        codes: [{ code: 'M365-AAAA-BBBB', productName: 'Microsoft 365 30 วัน', denomination: 18 }],
        message: 'ตรวจสลิปผ่าน — ส่งโค้ดเรียบร้อยแล้ว ดูโค้ดด้านล่างได้เลย',
      }),
    });
    const onConfirmed = vi.fn();
    render(
      <SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled onConfirmed={onConfirmed} />,
    );
    pickAndSubmit();

    expect(await screen.findByText('M365-AAAA-BBBB')).toBeTruthy();
    expect(screen.getByText(/Microsoft 365 30 วัน/)).toBeTruthy();
    expect(onConfirmed).toHaveBeenCalledWith('confirmed');
    // The upload controls are gone — nothing left to submit.
    expect(screen.queryByRole('button', { name: /เลือกไฟล์สลิป/ })).toBeNull();
    const link = screen.getByRole('link', { name: /ดูรายละเอียดคำสั่งซื้อ/ });
    expect(link.getAttribute('href')).toBe('/checkout/confirmation/cu-1');
  });

  it('never prints a machine error code when the verify response carries no message', async () => {
    // THE client screenshot: `NO_PENDING_ATTEMPT` in red on the payment page.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'NO_PENDING_ATTEMPT', slipStored: true }),
    });
    render(<SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled />);
    pickAndSubmit();

    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('แอดมิน');
    expect(box.textContent).not.toContain('NO_PENDING_ATTEMPT');
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