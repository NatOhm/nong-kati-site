// @vitest-environment jsdom
/**
 * Manual-transfer settings panel — the form that decides which bank account
 * every customer is told to pay into.
 *
 * The split of /management/settings into one file per section (2026-11-03)
 * exists so this panel can be rendered instead of grepped. What is worth
 * pinning here is the round trip:
 *
 *  - the account loaded from the server is what gets saved back, untouched,
 *    so a save cannot blank the account the storefront shows;
 *  - an edit made in the form wins over that initial load;
 *  - a rejected save is visible to the admin and never says "saved".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const STORED = {
  enabled: true,
  accountType: 'bank' as const,
  accountName: 'กนกนาถ โรจนวุฒิ',
  accountNumber: '199-1-73578-6',
  bankName: 'กสิกรไทย',
  qrImageUrl: null as string | null,
};

const { adminFetchMock } = vi.hoisted(() => ({ adminFetchMock: vi.fn() }));
vi.mock('@/lib/adminSession', () => ({ adminFetch: adminFetchMock }));

import { ManualTransferSettings } from '@/app/management/settings/sections/ManualTransferSettings';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Render the panel against a mocked adminFetch. `save()` presses the panel's
 * own save button and waits for the PUT it issues, so the test exercises the
 * same path an admin does.
 */
async function renderPanel(opts: { stored?: unknown; putResponse?: () => Response } = {}) {
  adminFetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
    if (init?.method === 'PUT') {
      return (opts.putResponse ?? (() => json({ ok: true })))();
    }
    return json(opts.stored ?? STORED);
  });

  render(<ManualTransferSettings />);
  const user = userEvent.setup();

  return {
    user,
    save: async (): Promise<void> => {
      const button = await screen.findByRole('button', { name: 'บันทึกข้อมูลโอนเงิน' });
      await user.click(button);
      await waitFor(() =>
        expect(
          adminFetchMock.mock.calls.some(
            ([, init]) => (init as { method?: string } | undefined)?.method === 'PUT',
          ),
        ).toBe(true),
      );
    },
  };
}

/** Body of the PUT the panel sent on save. */
function savedBody(): Record<string, unknown> {
  const call = adminFetchMock.mock.calls.find(
    ([, init]) => (init as { method?: string } | undefined)?.method === 'PUT',
  );
  if (!call) throw new Error('the panel never sent a PUT');
  return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
}

describe('manual-transfer panel — the loaded account survives a save', () => {
  it('saves back exactly the account it loaded', async () => {
    const { save } = await renderPanel();
    await screen.findByDisplayValue('199-1-73578-6');
    await save();

    expect(savedBody()).toEqual({
      enabled: true,
      accountType: 'bank',
      accountName: 'กนกนาถ โรจนวุฒิ',
      accountNumber: '199-1-73578-6',
      bankName: 'กสิกรไทย',
      qrImageUrl: null,
    });
    // A successful save is announced, not silently swallowed.
    expect(await screen.findByText('บันทึกแล้ว!')).toBeTruthy();
  });

  it('sends an edited account number, not the one loaded', async () => {
    const { save, user } = await renderPanel();
    const number = await screen.findByPlaceholderText('000-0-00000-0');

    await user.clear(number);
    await user.type(number, '1991735786');
    await save();

    expect(savedBody()['accountNumber']).toBe('1991735786');
  });

  it('switching the account type still carries the account number', async () => {
    const { save, user } = await renderPanel();
    await screen.findByDisplayValue('199-1-73578-6');

    await user.click(screen.getByRole('radio', { name: 'พร้อมเพย์' }));
    await save();

    const body = savedBody();
    expect(body['accountType']).toBe('promptpay');
    // The number is still sent: switching type must not drop the account.
    expect(body['accountNumber']).toBe('199-1-73578-6');
  });
});

describe('manual-transfer panel — saving stays switched off until enabled', () => {
  it('hides the account fields while disabled and reveals them on toggle', async () => {
    const { user } = await renderPanel({ stored: { ...STORED, enabled: false } });

    await waitFor(() => expect(screen.queryByPlaceholderText('000-0-00000-0')).toBeNull());
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await user.click(toggle);
    expect(screen.getByPlaceholderText('000-0-00000-0')).toBeTruthy();
  });
});

describe('manual-transfer panel — a rejected save is visible', () => {
  it('shows the server error and never claims the save worked', async () => {
    const { save } = await renderPanel({
      putResponse: () => json({ error: 'INVALID_ACCOUNT_NUMBER' }, 400),
    });
    await screen.findByDisplayValue('199-1-73578-6');
    await save();

    expect(await screen.findByText('INVALID_ACCOUNT_NUMBER')).toBeTruthy();
    expect(screen.queryByText('บันทึกแล้ว!')).toBeNull();
    expect(screen.getByText('บันทึกข้อมูลโอนเงิน')).toBeTruthy();
  });

  it('translates the QR-path rejection into something an admin can act on', async () => {
    const { save } = await renderPanel({
      putResponse: () => json({ error: 'INVALID_QR_IMAGE_URL' }, 400),
    });
    await screen.findByDisplayValue('199-1-73578-6');
    await save();

    expect(
      await screen.findByText(
        'พาธรูป QR ไม่ถูกต้อง — ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น',
      ),
    ).toBeTruthy();
  });
});
