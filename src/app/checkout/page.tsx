'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Construction } from 'lucide-react';

import { PageShell } from '@/components/layout/PageShell';
import { MascotImage } from '@/components/ui/MascotImage';
import { CheckoutStepper } from '@/components/checkout/CheckoutStepper';
import { ContactForm, type ContactFormData } from '@/components/checkout/ContactForm';
import { PaymentMethodSelector } from '@/components/checkout/PaymentMethodSelector';
import { PromptPayQR } from '@/components/checkout/PromptPayQR';
import { OrderSummaryPanel } from '@/components/checkout/OrderSummaryPanel';
import { TrustBadgeRow } from '@/components/checkout/TrustBadgeRow';
import { CartIcon } from '@/components/cart/CartIcon';
import { useCart } from '@/hooks/useCart';
import { createOrder, type Order } from '@/api/orders';
import { initiatePayment, getPaymentStatus } from '@/api/payments';
import { formatThb } from '@/lib/pricing';

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
    case 'PAYMENT_INIT_FAILED':
      return 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง';
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง หากยังมีปัญหาติดต่อฝ่ายสนับสนุน';
  }
}

/**
 * Checkout page — 2-step flow with real payment initiation.
 * Step 1: Contact Info → creates order (pending_payment)
 * Step 2: Payment — PromptPay QR or Card placeholder
 */
export default function CheckoutPage(): React.JSX.Element {
  const { cart, isLoaded, itemCount, clearCart } = useCart();
  const [step, setStep] = useState<1 | 2>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [contactData, setContactData] = useState<ContactFormData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'card'>('promptpay');
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentState, setPaymentState] = useState<{
    attemptId: string;
    qrImageUrl?: string;
    qrExpiresAt?: Date;
    gatewayRef?: string;
    status: 'pending' | 'polling' | 'succeeded' | 'expired' | 'failed';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const newOrder = createOrder(
          {
            sessionKey: cart.sessionKey,
            customerEmail: data.email,
            paymentMethod:
              paymentMethod === 'card' ? ('credit_card' as const) : ('promptpay' as const),
            lineOptIn: false,
            marketingOptIn: data.marketingOptIn,
            tosAccepted: data.tosAccepted,
            tosVersion: '1.0',
            requiresTaxInvoice: data.requiresTaxInvoice,
            ...(data.phone ? { customerPhone: data.phone } : {}),
            ...(data.requiresTaxInvoice
              ? { taxInvoiceName: data.taxInvoiceName, taxInvoiceTaxId: data.taxInvoiceTaxId }
              : {}),
          },
          cart,
        );

        setContactData(data);
        setOrder(newOrder);
        setCompletedSteps([1]);
        setStep(2);

        // Auto-initiate payment
        await handleInitiatePayment(newOrder);
      } catch (err) {
        setError(friendlyOrderError(err));
      } finally {
        setLoading(false);
      }
    },
    [cart, paymentMethod],
  );

  // Initiate payment
  const handleInitiatePayment = useCallback(
    async (targetOrder: Order) => {
      setLoading(true);
      setError(null);

      try {
        const result = await initiatePayment(
          targetOrder.id,
          paymentMethod === 'card' ? 'credit_card' : 'promptpay',
          targetOrder,
        );

        setPaymentState({
          attemptId: result.paymentAttemptId,
          qrImageUrl: result.qrImageUrl as string | undefined,
          qrExpiresAt: result.qrExpiresAt ? new Date(result.qrExpiresAt) : undefined,
          gatewayRef: result.gatewayRef as string | undefined,
          status: 'pending',
        } as any);

        // Start polling for PromptPay
        if (paymentMethod === 'promptpay' && result.qrExpiresAt) {
          startPaymentPolling(result.paymentAttemptId);
        }
      } catch (err) {
        setError(friendlyOrderError(err));
      } finally {
        setLoading(false);
      }
    },
    [paymentMethod],
  );

  // Poll payment status (every 3 seconds for PromptPay)
  const startPaymentPolling = useCallback(
    (attemptId: string) => {
      const interval = setInterval(() => {
        const status = getPaymentStatus(attemptId);
        if (status && status.status === 'succeeded') {
          clearInterval(interval);
          setPaymentState((prev) => (prev ? { ...prev, status: 'succeeded' } : null));
          // Redirect to confirmation
          if (order) {
            window.location.href = `/checkout/confirmation/${order.confirmationUuid}`;
          }
        }
      }, 3000);

      // Stop polling after 15 minutes (QR expiry)
      setTimeout(() => clearInterval(interval), 15 * 60 * 1000);
    },
    [order],
  );

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
          <MascotImage
            size={96}
            className="mascot-beg mb-6 drop-shadow-[0_8px_16px_rgba(124,45,18,0.25)]"
            alt=""
          />
          <h1 className="mb-4 text-2xl font-bold text-fg">ตะกร้าว่างเปล่า</h1>
          <p className="mb-6 text-fg-placeholder">
            น้องแฮมสเตอร์ขอสินค้าหน่อย — เพิ่มสินค้าในตะกร้าก่อนชำระเงินนะ
          </p>
          <Link
            href="/"
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
        <div className="mb-6 rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
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
            </div>
          )}

          {step === 2 && (
            <div className="rounded-md border border-line-subtle bg-white p-6">
              {/* Payment method selector */}
              <PaymentMethodSelector
                selected={paymentMethod}
                onChange={setPaymentMethod}
                disabled={!!paymentState}
              />

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
                          onClick={() => order && handleInitiatePayment(order)}
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
