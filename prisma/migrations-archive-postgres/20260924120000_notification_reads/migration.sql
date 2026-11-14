-- Notifications: per-customer read state for promo (coupon) notifications.
-- The notifications themselves are live active coupons — no notification rows.

CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRead_customerId_couponId_key" ON "NotificationRead"("customerId", "couponId");
CREATE INDEX "NotificationRead_customerId_idx" ON "NotificationRead"("customerId");

ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
