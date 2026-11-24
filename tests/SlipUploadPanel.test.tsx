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
    // A wrong amount is not a timing problem — retrying the same slip cannot help.
    expect(screen.queryByRole('button', { name: /ตรวจสลิปอีกครั้ง/ })).toBeNull();
    // The server already stored the image — exactly one request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[0]![0]).toContain('/api/v1/payments/slip-verify');
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('offers a retry when the bank has not published the slip yet (Bangkok Bank lag)', async () => {
    // Slip2Go answers 200404 for a transfer Bangkok Bank has not published
    // yet — the normal first answer for a กรุงเทพ slip. Without a retry the
    // customer had to reload the page and re-pick the screenshot, so the
    // check could never be completed inside the 2–3 minute window.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({
        error: 'SLIP_DELAYED',
        message:
          'ธนาคารยังไม่พบข้อมูลสลิปนี้ (บางธนาคารใช้เวลาส่งข้อมูล 2–3 นาที) — รอสักครู่แล้วลองใหม่ หรือรอแอดมินตรวจให้',
        slipStored: true,
      }),
    });
    render(<SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled />);
    pickAndSubmit();

    const box = await screen.findByRole('status');
    expect(box.textContent).toContain('2–3 นาที');
    // The retry re-checks the file already on the order — no second picker.
    expect(screen.queryByRole('button', { name: /เลือกสลิปใหม่|เลือกไฟล์สลิป/ })).toBeNull();
    const retry = screen.getByRole('button', { name: /ตรวจสลิปอีกครั้ง/ });

    // The bank has published it by the time the customer taps again.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'confirmed', codes: [], message: 'ตรวจสลิปผ่าน — ส่งโค้ดเรียบร้อยแล้ว' }),
    });
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[1]![0]).toContain('/api/v1/payments/slip-verify');
    expect((await screen.findByRole('status')).textContent).toContain('ตรวจสลิปผ่าน');
  });

  it('keeps the picker after a rejection so a corrected slip can be uploaded', async () => {
    // Wrong amount / receiver mismatch used to replace the upload controls
    // with the error box: the customer could only reload the page and start
    // over, so a rejected slip was a dead end.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'RECEIVER_MISMATCH',
        message: 'บัญชีผู้รับในสลิปไม่ตรงกับร้าน',
        slipStored: true,
      }),
    });
    render(<SlipUploadPanel orderId="o1" slipUploadToken="tok" slipVerifyEnabled />);
    pickAndSubmit();

    expect((await screen.findByRole('status')).textContent).toContain('บัญชีผู้รับในสลิปไม่ตรงกับร้าน');
    const picker = screen.getByRole('button', { name: /เลือกสลิปใหม่/ });

    // The corrected slip is checked against the same order.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'confirmed', codes: [], message: 'ตรวจสลิปผ่าน — ส่งโค้ดเรียบร้อยแล้ว' }),
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['fixed-bytes'], 'fixed.png', { type: 'image/png' })] },
    });
    expect(picker.isConnected).toBe(true);
    // Picking clears the old verdict, then the normal submit runs again.
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ตรวจสลิป' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[1]![0]).toContain('/api/v1/payments/slip-verify');
    expect((await screen.findByRole('status')).textContent).toContain('ตรวจสลิปผ่าน');
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