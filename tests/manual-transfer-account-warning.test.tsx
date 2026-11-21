// @vitest-environment jsdom
/**
 * Blank store receiving account → visible warning (2026-11-21).
 *
 * `slip-verify` now fails closed: with no store account there is nothing to
 * compare the slip's receiver against, so every slip is parked for manual
 * review instead of auto-confirming. That is the right behaviour and the wrong
 * surprise — an admin with an empty account number would only discover it when
 * customers start queuing.
 *
 * The panel therefore warns while `storeReceiverDigits(form.accountNumber)` is
 * empty, i.e. exactly the condition the route uses (blank, spaces, dashes and
 * other non-digits all normalise to ''). This test renders the real component
 * and checks the warning is present, stays present for a symbol-only value, and
 * disappears once real digits are typed — the panel's own UI, not a copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ManualTransferSettings } from '@/app/management/settings/sections/ManualTransferSettings';

const adminFetchMock = vi.fn();

vi.mock('@/lib/adminSession', () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
  adminJson: vi.fn(),
}));

const WARNING = 'ยังไม่ได้ตั้งบัญชีรับเงินของร้าน';

function stubGet(accountNumber: string): void {
  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      enabled: true,
      accountType: 'bank',
      accountName: 'ร้านนกกะทา',
      accountNumber,
      bankName: 'ธนาคารกรุงเทพ',
      qrImageUrl: null,
    }),
  });
}

function renderPanel(): void {
  render(<ManualTransferSettings registerSaver={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('manual-transfer settings — blank store account warning', () => {
  it('warns, and says slips will be refused, when the account is blank', async () => {
    stubGet('');
    renderPanel();

    expect(await screen.findByText(WARNING)).toBeTruthy();
    // The consequence has to be in the copy, not just the field being empty.
    expect(document.body.textContent).toContain('ปฏิเสธทุกสลิป');
    expect(document.body.textContent).toContain('ร้านยังไม่ได้ตั้งบัญชีรับเงิน');
  });

  it('keeps the warning for a symbol-only value (the route strips non-digits too)', async () => {
    stubGet('');
    renderPanel();
    await screen.findByText(WARNING);

    fireEvent.change(screen.getByPlaceholderText('000-0-00000-0'), {
      target: { value: '--- --- ----' },
    });
    expect(screen.queryByText(WARNING)).not.toBeNull();
  });

  it('shows no warning when the stored account already has digits', async () => {
    stubGet('199-1-73578-6');
    renderPanel();
    await screen.findByDisplayValue('199-1-73578-6');

    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('clears the warning as soon as the admin types real digits', async () => {
    stubGet('');
    renderPanel();
    await screen.findByText(WARNING);

    fireEvent.change(screen.getByPlaceholderText('000-0-00000-0'), {
      target: { value: '199-1-73578-6' },
    });
    await waitFor(() => expect(screen.queryByText(WARNING)).toBeNull());
  });
});
