-- Customer sign-in channels: Facebook OAuth + phone (SMS OTP).
-- phoneVerified marks that the customer proved control of phoneNumber via an
-- OTP delivered to it. PhoneOtpToken mirrors MagicLinkToken: only the SHA-256
-- hash of the 6-digit code is stored; usedAt marks single-use consumption and
-- attemptedAt records attempts (incl. failures) for the audit trail.

ALTER TABLE "Customer" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PhoneOtpToken" (
    "id" TEXT NOT NULL,
    "destinationPhone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtpToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneOtpToken_codeHash_key" ON "PhoneOtpToken"("codeHash");
CREATE INDEX "PhoneOtpToken_destinationPhone_idx" ON "PhoneOtpToken"("destinationPhone");
CREATE INDEX "PhoneOtpToken_expiresAt_idx" ON "PhoneOtpToken"("expiresAt");
