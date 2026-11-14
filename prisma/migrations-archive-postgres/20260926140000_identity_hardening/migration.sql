-- Security review 2026-09-26: identity + mock-wiring remediations.
-- Additive only: one new table, two nullable AdminUser columns, one unique
-- index. phoneNumber had zero non-null rows at migration time (verified),
-- so the unique index cannot fail.

CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataSubjectRequest_requestId_key" ON "DataSubjectRequest"("requestId");
CREATE INDEX "DataSubjectRequest_status_createdAt_idx" ON "DataSubjectRequest"("status", "createdAt");
CREATE INDEX "DataSubjectRequest_email_idx" ON "DataSubjectRequest"("email");

ALTER TABLE "AdminUser" ADD COLUMN "failedTotpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN "totpLockedUntil" TIMESTAMP(3);

-- Canonical phone identity: at most one customer per E.164 number.
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");
