-- Automatic slip verification (SlipOK): store the verified slip's bank
-- transaction reference on the payment attempt, unique globally — one real
-- bank transfer can confirm exactly one order, ever.
ALTER TABLE "PaymentAttempt" ADD COLUMN "slipVerifiedRef" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "slipVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PaymentAttempt" ADD COLUMN "slipReceiverAccount" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "slipVerifiedBy" TEXT;

CREATE UNIQUE INDEX "PaymentAttempt_slipVerifiedRef_key" ON "PaymentAttempt"("slipVerifiedRef");
