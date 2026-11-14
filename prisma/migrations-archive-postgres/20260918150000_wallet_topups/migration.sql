-- AlterTable: wallet balance on customers
ALTER TABLE "Customer" ADD COLUMN "walletBalanceThb" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable: top-up ledger
CREATE TABLE "TopUpLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountThb" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'promptpay',
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopUpLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TopUpLog" ADD CONSTRAINT "TopUpLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TopUpLog_customerId_idx" ON "TopUpLog"("customerId");
CREATE INDEX "TopUpLog_createdAt_idx" ON "TopUpLog"("createdAt");
