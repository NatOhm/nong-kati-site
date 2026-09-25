'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, Clock, Construction } from 'lucide-react';

import { PageShell } from '@/components/layout/PageShell';
import { SiteMascot } from '@/components/ui/SiteMascot';
import { CheckoutStepper } from '@/components/checkout/CheckoutStepper';
import { ContactForm, type ContactFormData } from '@/components/checkout/ContactForm';
import { PaymentMethodSelector } from '@/components/checkout/PaymentMethodSelector';
import { PromptPayQR } from '@/components/checkout/PromptPayQR';
import { SlipUploadPanel } from '@/components/checkout/SlipUploadPanel';
import { OrderSummaryPanel } from '@/components/checkout/OrderSummaryPanel';
import { TrustBadgeRow } from '@/components/checkout/TrustBadgeRow';
import { CartIcon } from '@/components/cart/CartIcon';
import { useCart } from '@/hooks/useCart';
import { apiCreateOrder, apiInitiatePayment, apiPollPayment, type Order } from '@/api/orderClient';
import { formatThb } from '@/lib/pricing';
import { cn } from '@/utils/cn';

/** Map internal error codes to Thai copy users can act on — never raw codes. */
function friendlyOrderError(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  switch (code) {
    case 'OUT_OF_STOCK':
      return 'สินค้าบางรายการหมดสต๊อกพอดี — กรุณาลบรายการนั้นออกแล้วลองอีกครั้ง';
    case 'CART_EMPTY':
      return 'ตะกร้าว่างเปล่า กรุณาเพิ่มสินค้าก่อนดำเนินการชำระเงิน';
    case 'INVALID_EMAIL':
      return 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    case 'TOS_NOT_ACCEPTED':
      return 'กรุณายอมรับเงื่อนไขการใช้งานก่อนดำเนินการต่อ';
    case 'VARIANT_NOT_FOUND':
      return 'สินค้าบางรายการไม่พร้อมขายแล้ว — กรุณาลบออกจากตะกร้าแล้วเพิ่มใหม่';
    case 'PAYMENT_INIT_FAILED':
      return 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง';
    case 'PAYMENT_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
      return 'ระบบ QR ยังไม่พร้อมใช้งาน — กรุณาใช้ช่องทางโอนเงินแล้วส่งสลิป หรือใช้เครดิตในกระเป๋า';
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง หากยังมีปัญหาติดต่อฝ่ายสนับสนุน';
  }
}

/** Coupon error codes → Thai copy. */
const COUPON_ERRORS: Record<string, string> = {
  INACTIVE: 'โค้ดส่วนลดไม่ถูกต้องหรือถูกปิดใช้งาน',
  NOT_STARTED: 'โค้ดนี้ยังไม่เริ่มใช้ได้',
  EXPIRED: 'โค้ดนี้หมดอายุแล้ว',
  MIN_SPEND: 'ยอดซื้อไม่ถึงขั้นต่ำของโค้ดนี้',
  USAGE_LIMIT: 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว',
  INVALID: 'กรุณากรอกโค้ดส่วนลด',
};

/**
 * Checkout page — 2-step flow.
 * Step 1: Contact Info → creates order (pending_payment)
 * Step 2: Payment — manual bank transfer + slip upload (the production path
 * while the real Omise gateway is unimplemented — review High #2),
 * PromptPay QR when the gateway is available, or wallet credit.
 */
export default function CheckoutPage(): React.JSX.Element {
  const { cart, isLoaded, itemCount, clearCart } = useCart();
  const [step, setStep] = useState<1 | 2>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [contactData, setContactData] = useState<ContactFormData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'card' | 'wallet'>('promptpay');
  const [order, setOrder] = useState<Order | null>(null);
  const [slipUploadToken, setSlipUploadToken] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<{
    attemptId: string;
    qrImageUrl?: string;
    qrExpiresAt?: Date;
    gatewayRef?: string;
    status: 'pending' | 'polling' | 'succeeded' | 'expired' | 'failed';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slipEnabled, setSlipEnabled] = useState(false);
  const [manualInfo, setManualInfo] = useState<{
    enabled: boolean;
    accountName: string | null;
    accountNumber: string | null;
    accountType: 'promptpay' | 'bank';
    bankName: string | null;
  } | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountThb: number } | null>(
    null,
  );
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [walletBalanceThb, setWalletBalanceThb] = useState<number | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);

  // Wallet balance — fetched once for logged-in customers (the wallet option
  // is hidden for guests; a 401 here just means no balance).
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balanceThb?: number } | null) => {
        if (!cancelled) {
          setWalletBalanceThb(typeof d?.balanceThb === 'number' ? d.balanceThb : null);
        }
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceThb(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  // Automatic slip verification availability — the panel renders only when
  // the server has NK_SLIP_OK_KEY configured; otherwise the manual admin
  // confirm fallback applies unchanged.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/payments/slip-verify', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enabled?: boolean } | null) => {
        if (!cancelled) setSlipEnabled(Boolean(d?.enabled));
      })
      .catch(() => {
        if (!cancelled) setSlipEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual transfer instructions (admin-configured) — the fallback payment
  // path shown while the real Omise gateway is not implemented.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/payments/manual-info')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            enabled: boolean;
            accountName: string | null;
            accountNumber: string | null;
            accountType: 'promptpay' | 'bank';
            bankName: string | null;
          } | null,
        ) => {
          if (!cancelled) setManualInfo(d && d.enabled ? d : null);
        },
      )
      .catch(() => {
        if (!cancelled) setManualInfo(null);
      });
  }, []);

  // Validate + stage a coupon code (server check; applied on order create).
  const handleApplyCoupon = useCallback(async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || !cart) return;
    setCouponMsg(null);
    try {
      const res = await fetch('/api/v1/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalThb: cart.summary.subtotalThb }),
      });
      const data = await res.json();
      if (data?.ok) {
        setCouponApplied({ code, discountThb: data.discountThb });
        setCouponMsg(`ใช้โค้ด ${code} แล้ว — ลด ${formatThb(data.discountThb)}`);
      } else {
        setCouponApplied(null);
        setCouponMsg(COUPON_ERRORS[data?.error as string] ?? 'โค้ดส่วนลดไม่ถูกต้อง');
      }
    } catch {
      setCouponMsg('ตรวจสอบโค้ดไม่สำเร็จ กรุณาลองใหม่');
    }
  }, [couponInput, cart]);

  // Step 1: Submit contact info → create order → advance to Step 2
  const handleContactSubmit = useCallback(
    async (data: ContactFormData) => {
      if (!cart || cart.items.length === 0) {
        setError('ตะกร้าว่างเปล่า กรุณาเพิ่มสินค้าก่อนดำเนินการชำระเงิน');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await apiCreateOrder(
          {
            email: data.email,
            ...(data.phone ? { phone: data.phone } : {}),
            marketingOptIn: data.marketingOptIn,
            tosAccepted: data.tosAccepted,
            requiresTaxInvoice: data.requiresTaxInvoice,
            ...(data.requiresTaxInvoice
              ? { taxInvoiceName: data.taxInvoiceName, taxInvoiceTaxId: data.taxInvoiceTaxId }
              : {}),
          },
          cart,
          couponApplied?.code,
        );

        setContactData(data);
        setOrder(result.order);
        setSlipUploadToken(result.slipUploadToken ?? null);
        setCompletedSteps([1]);
        setStep(2);
      } catch (err) {
        setError(friendlyOrderError(err));
      } finally {
        setLoading(false);
      }
    },
    [cart, paymentMethod, couponApplied],
  );

  // Initiate payment
  const handleInitiatePayment = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiInitiatePayment(orderId);

      setPaymentState({
        attemptId: result.paymentAttemptId,
        qrImageUrl: result.qrImageUrl as string | undefined,
        qrExpiresAt: result.qrExpiresAt ? new Date(result.qrExpiresAt) : undefined,
        gatewayRef: result.gatewayRef as string | undefined,
        status: 'pending',
      } as any);

      // Start polling for PromptPay
      if (result.qrExpiresAt) {
        startPaymentPolling(result.paymentAttemptId);
      }
    } catch (err) {
      setError(friendlyOrderError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Pay with wallet credit. On ANY failure (insufficient balance, race,
   * server hiccup) the UI automatically falls back to the PromptPay QR so
   * the customer always has a way to pay — the wallet attempt never leaves
   * a half-state (server-side it's one atomic transaction).
   */
  const handleWalletPay = useCallback(async () => {
    if (!order || walletBusy) return;
    setWalletBusy(true);
    setWalletMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/orders/${order.id}/pay-wallet`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        error?: { code?: string };
      };
      if (res.ok && body.success) {
        clearCart();
        window.location.href = `/checkout/confirmation/${order.confirmationUuid}`;
        return;
      }
      const code = body.error?.code ?? 'WALLET_PAY_FAILED';
      if (code === 'INSUFFICIENT_BALANCE') {
        setWalletMsg('ยอดเครดิตไม่พอ — เลือกชำระผ่าน PromptPay แทนได้เลย');
      } else if (code === 'ORDER_NOT_PAYABLE') {
        setWalletMsg('คำสั่งซื้อนี้ชำระเงินแล้วหรือถูกยกเลิก');
      } else {
        // Any unexpected failure → fall back to PromptPay automatically.
        setWalletMsg('ระบบเครดิตขัดข้องชั่วคราว — กรุณาชำระผ่าน PromptPay แทน');
        setPaymentMethod('promptpay');
        await handleInitiatePayment(order.id);
      }
    } catch {
      setWalletMsg('ระบบเครดิตขัดข้องชั่วคราว — กรุณาชำระผ่าน PromptPay แทน');
      setPaymentMethod('promptpay');
      await handleInitiatePayment(order.id);
    } finally {
      setWalletBusy(false);
    }
  }, [order, walletBusy, clearCart, handleInitiatePayment]);

  // Poll payment status (every 3 seconds for PromptPay)
  const startPaymentPolling = useCallback((attemptId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await apiPollPayment(attemptId);
        if (status.status === 'succeeded') {
          clearInterval(interval);
          setPaymentState((prev) => (prev ? { ...prev, status: 'succeeded' } : null));
          // Redirect to confirmation
          if (status.confirmationUuid) {
            window.location.href = `/checkout/confirmation/${status.confirmationUuid}`;
          }
        }
      } catch {
        // transient poll failure — retry on next tick
      }
    }, 3000);

    // Stop polling after 15 minutes (QR expiry)
    setTimeout(() => clearInterval(interval), 15 * 60 * 1000);
  }, []);

  // Handle QR expiry
  const handleQrExpire = useCallback(() => {
    setPaymentState((prev) => (prev ? { ...prev, status: 'expired' } : null));
  }, []);

  // Step click handler
  const handleStepClick = useCallback((targetStep: number) => {
    if (targetStep === 1) {
      setStep(1);
    }
  }, []);

  // Redirect if cart is empty
  if (isLoaded && (!cart || cart.items.length === 0)) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SiteMascot size={120} className="mascot-wave mb-6" />
          <h1 className="mb-4 text-2xl font-bold text-fg">ตะกร้าว่างเปล่า</h1>
          <p className="mb-6 text-fg-placeholder">
            น้องแฮมสเตอร์ขอสินค้าหน่อย — เพิ่มสินค้าในตะกร้าก่อนชำระเงินนะ
          </p>
          {/* Recovery goes to the catalog, not the homepage (audit #1). */}
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-peach-400"
          >
            <ArrowLeft size={16} />
            เลือกซื้อสินค้า
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between py-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-fg-placeholder hover:text-fg-brand"
        >
          <ArrowLeft size={16} />
          กลับ
        </Link>
        <h1 className="font-display text-xl font-bold text-fg">ชำระเงิน</h1>
        <CartIcon count={itemCount} />
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <CheckoutStepper
          currentStep={step}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700"
        >
          {error}
        </div>
      )}

      {/* Content */}
      <div className="grid gap-8 pb-16 md:grid-cols-[1fr_360px]">
        {/* Main area */}
        <div>
          {step === 1 && (
            <div className="rounded-md border border-line-subtle bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-fg">ข้อมูลการติดต่อ</h2>
              <ContactForm onSubmit={handleContactSubmit} loading={loading} />

              {/* Coupon code (คูปองส่วนลด) */}
              <div className="mt-6 border-t border-line-subtle pt-4">
                <label htmlFor="coupon-code" className="mb-1.5 block text-sm font-medium text-fg">
                  โค้ดส่วนลด (ถ้ามี)
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon-code"
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="เช่น SUMMER10"
                    className="h-10 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-placeholder focus:border-clay-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={!couponInput.trim()}
                    className="h-10 shrink-0 rounded-md bg-surface-brand px-4 text-sm font-semibold text-fg-inverse transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    ใช้โค้ด
                  </button>
                </div>
                {couponMsg && (
                  <p
                    className={cn(
                      'mt-1.5 text-xs',
                      couponApplied ? 'text-jade-600' : 'text-coral-600',
                    )}
                  >
                    {couponMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rounded-md border border-line-subtle bg-white p-6">
              {/* Payment method selector */}
              <PaymentMethodSelector
                selected={paymentMethod}
                onChange={setPaymentMethod}
                disabled={!!paymentState || walletBusy}
                walletBalanceThb={walletBalanceThb}
              />

              {/* Wallet pay panel */}
              {paymentMethod === 'wallet' && (
                <div className="mt-6">
                  <div className="rounded-md border border-line-brand bg-peach-50 p-4">
                    <p className="text-sm text-fg-brand">
                      ยอดชำระ {formatThb(order?.totalAmountThb ?? 0)} จะถูกหักจากเครดิต (
                      {formatThb(walletBalanceThb ?? 0)}) ทันที — โค้ดส่งถึงหน้าถัดไปเลย
                    </p>
                    {walletMsg && (
                      <p className="mt-2 rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-xs text-coral-700">
                        {walletMsg}
                      </p>
                    )}
                    <button
                      onClick={() => void handleWalletPay()}
                      disabled={walletBusy || !!paymentState}
                      className="mt-3 w-full rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-peach-400 disabled:opacity-50"
                    >
                      {walletBusy ? 'กำลังตัดเครดิต...' : 'ยืนยันชำระด้วยเครดิต'}
                    </button>
                  </div>
                </div>
              )}

              {/* Manual transfer — production path while the real Omise
                  gateway is not implemented (review High #2): the customer
                  transfers to the store account and uploads the slip; the
                  admin (or SlipOK) confirms. */}
              {paymentMethod === 'promptpay' && !paymentState?.qrImageUrl && manualInfo && (
                <div className="mt-6 space-y-4">
                  <div className="rounded-md border border-line-brand bg-peach-50 p-4">
                    <div className="flex items-start gap-3">
                      <Banknote size={20} className="mt-0.5 shrink-0 text-fg-brand" />
                      <div className="text-sm">
                        <p className="font-semibold text-fg">
                          {manualInfo.accountType === 'bank'
                            ? 'โอนเงินผ่านธนาคาร'
                            : 'โอนเงินผ่านพร้อมเพย์'}
                        </p>
                        <p className="mt-1 text-fg-muted">
                          โอนยอด <strong>{formatThb(order?.totalAmountThb ?? 0)}</strong>{' '}
                          ไปยังบัญชีด้านล่าง แล้วอัปโหลดสลิปเพื่อยืนยันการชำระเงิน
                        </p>
                        <dl className="mt-3 space-y-1">
                          <div className="flex gap-2">
                            <dt className="text-fg-muted">ชื่อบัญชี:</dt>
                            <dd className="font-medium text-fg">{manualInfo.accountName}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-fg-muted">
                              {manualInfo.accountType === 'bank'
                                ? 'เลขบัญชี:'
                                : 'เบอร์พร้อมเพย์ / เลขบัตร:'}
                            </dt>
                            <dd className="font-mono font-medium text-fg">
                              {manualInfo.accountNumber}
                            </dd>
                          </div>
                          {manualInfo.accountType === 'bank' && manualInfo.bankName && (
                            <div className="flex gap-2">
                              <dt className="text-fg-muted">ธนาคาร:</dt>
                              <dd className="font-medium text-fg">{manualInfo.bankName}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>
                  </div>

                  {order && paymentState?.status !== 'succeeded' && (
                    <SlipUploadPanel
                      orderId={order.id}
                      slipUploadToken={slipUploadToken}
                      slipVerifyEnabled={slipEnabled}
                    />
                  )}
                </div>
              )}

              {/* Payment display */}
              {paymentMethod === 'promptpay' &&
                paymentState?.qrImageUrl &&
                paymentState.qrExpiresAt && (
                  <div className="mt-6">
                    <PromptPayQR
                      qrDataUrl={paymentState.qrImageUrl}
                      amount={order?.totalAmountThb ?? 0}
                      expiresAt={paymentState.qrExpiresAt}
                      onExpire={handleQrExpire}
                    />

                    {/* Slip upload — ALWAYS available for pending PromptPay:
                        auto-verify first when SlipOK is on, otherwise the
                        slip goes straight to the admin for manual check. */}
                    {order && paymentState.status !== 'succeeded' && (
                      <SlipUploadPanel
                        orderId={order.id}
                        slipUploadToken={slipUploadToken}
                        slipVerifyEnabled={slipEnabled}
                      />
                    )}

                    {/* Status messages */}
                    {paymentState.status === 'succeeded' && (
                      <div className="mt-4 rounded-md border border-jade-500/40 bg-jade-900/20 px-4 py-3 text-sm text-jade-200">
                        ✓ การชำระเงินสำเร็จ — กำลังดำเนินการส่งโค้ด
                      </div>
                    )}
                    {paymentState.status === 'expired' && (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
                          QR หมดอายุ — กรุณาสร้าง QR ใหม่
                        </div>
                        <button
                          onClick={() => order && handleInitiatePayment(order.id)}
                          className="w-full rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-peach-400"
                        >
                          สร้าง QR ใหม่
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* Card payment placeholder */}
              {paymentMethod === 'card' && (
                <div className="mt-6">
                  <div className="rounded-md border border-line-brand bg-peach-50 px-4 py-6 text-center">
                    <Construction size={24} className="mx-auto mb-2 text-fg-brand" />
                    <p className="text-sm text-fg-brand">
                      ระบบชำระเงินด้วยบัตรเครดิตจะพร้อมใช้งานในเร็วๆ นี้
                    </p>
                    <p className="mt-1 text-xs text-fg-placeholder">
                      ฿{(order?.totalAmountThb ?? 0).toLocaleString()} — รองรับ Visa, Mastercard
                      (3DS2)
                    </p>
                  </div>
                </div>
              )}

              {/* Back to Step 1 */}
              {!paymentState && (
                <button
                  onClick={() => setStep(1)}
                  className="mt-6 w-full rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg-secondary hover:border-clay-400 hover:text-fg"
                >
                  กลับไปแก้ไขข้อมูล
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — Order Summary */}
        <div className="space-y-4">
          {cart && cart.items.length > 0 && <OrderSummaryPanel items={cart.items} />}
          <TrustBadgeRow />
        </div>
      </div>
    </PageShell>
  );
}
