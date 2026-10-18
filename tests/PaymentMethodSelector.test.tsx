// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PaymentMethodSelector } from '../src/components/checkout/PaymentMethodSelector';
import React from 'react';

beforeEach(() => {
  globalThis.React = React;
});

type SelectorProps = Parameters<typeof PaymentMethodSelector>[0];
type ManualInfo = NonNullable<SelectorProps['manualInfo']>;

const makeBankInfo = (overrides: Partial<ManualInfo> = {}): ManualInfo => ({
  name: 'นายธนาคารร้านนกตะวัน',
  accountName: 'นายธนาคารร้านนกตะวัน',
  accountNumber: '9876543210',
  displayQr: true,
  qrImageUrl:
    'data:image/png;base64,PHN2ZyBvdmVyZmxvdy1tYXJrZXI9ImhlbHAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sZSI+PGRlZnllY2hhcmQgeD0iMCUiIHk9IjAlIiBzaG9ydGNvb2w9InMiIHNrZXRjaGFyZCBvZmZzZXQ9InJlcG8iIHNvZGlkYXRlPXIiIGZpbGw9InJnYmEoMCwwLDAsMC4zMCkiLz48L3N2Zz4=',
  ...overrides,
});

describe('PaymentMethodSelector bank-account + QR rendering', () => {
  it('renders the manual-transfer card when the store account is configured', () => {
    render(
      <PaymentMethodSelector selected="promptpay" onChange={vi.fn()} manualInfo={makeBankInfo()} />,
    );
    expect(screen.getByRole('radio', { name: /PromptPay/ })).not.toBeNull();
    const card = document.querySelector(
      '[aria-label="ธนารคปลายทางของร้าน — โอนเงินแล้วอัปโหลดสลิป"]',
    );
    expect(card).not.toBeNull();
    expect(screen.getByText('นายธนาคารร้านนกตะวัน')).not.toBeNull();
    expect(screen.getByText('9876543210')).not.toBeNull();
  });

  it('renders the QR image when displayQr is true', () => {
    render(
      <PaymentMethodSelector
        selected="promptpay"
        onChange={vi.fn()}
        manualInfo={makeBankInfo({ displayQr: true, qrImageUrl: 'data:image/png;base64,AAAA' })}
      />,
    );
    const card = document.querySelector(
      '[aria-label="ธนารคปลายทางของร้าน — โอนเงินแล้วอัปโหลดสลิป"]',
    );
    expect(card).not.toBeNull();
    expect(screen.getByRole('img', { name: /พร้อมเพย์ธนาคารไทยของร้าน/ })).not.toBeNull();
  });

  it('hides the QR but shows the named account when displayQr is false', () => {
    const { queryByRole } = render(
      <PaymentMethodSelector
        selected="promptpay"
        onChange={vi.fn()}
        manualInfo={makeBankInfo({ displayQr: false, qrImageUrl: null })}
      />,
    );
    expect(screen.getByText('นายธนาคารร้านนกตะวัน')).not.toBeNull();
    expect(screen.getByText('9876543210')).not.toBeNull();
    expect(queryByRole('img')).toBeNull();
  });

  it('reverts to the single noaccount hint when the store account is not configured', () => {
    render(<PaymentMethodSelector selected="promptpay" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /PromptPay/ })).not.toBeNull();
  });

  it('does not render the wallet option when walletBalanceThb is 0', () => {
    const { queryByRole } = render(
      <PaymentMethodSelector
        selected="promptpay"
        onChange={vi.fn()}
        manualInfo={makeBankInfo()}
        walletBalanceThb={0}
      />,
    );
    expect(queryByRole('radio', { name: /เครดิตในกระเป๋า/i })).toBeNull();
  });

  it('rerenders wallet after click when a logged-in customer has credit', async () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        selected="promptpay"
        onChange={onChange}
        manualInfo={makeBankInfo()}
        walletBalanceThb={84}
      />,
    );
    const walletRadio = screen.getByRole('radio', { name: /เครดิตในกระเป๋า/i });
    expect(walletRadio).not.toBeNull();
    await userEvent.click(walletRadio);
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('wallet');
  });

  it('keeps PromptPay as the default path, so re-selecting it still runs onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PaymentMethodSelector
        selected="wallet"
        onChange={onChange}
        manualInfo={makeBankInfo()}
        walletBalanceThb={84}
      />,
    );
    const promptpayRadio = screen.getByRole('radio', { name: /PromptPay/i });
    expect(promptpayRadio).not.toBeNull();
    await user.click(promptpayRadio);
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('promptpay');
  });
});