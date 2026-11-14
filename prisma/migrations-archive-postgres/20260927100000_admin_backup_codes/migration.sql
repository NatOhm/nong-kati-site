-- External audit #9 (2026-09-27): make 2FA backup codes real — hashed at
-- rest, verified at login, consumed exactly once.

CREATE TABLE "AdminBackupCode" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBackupCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminBackupCode_codeHash_key" ON "AdminBackupCode"("codeHash");
CREATE INDEX "AdminBackupCode_adminUserId_idx" ON "AdminBackupCode"("adminUserId");
CREATE INDEX "AdminBackupCode_usedAt_idx" ON "AdminBackupCode"("usedAt");

-- Add the foreign key (Prisma's relationMode is foreignKeys by default).
ALTER TABLE "AdminBackupCode"
  ADD CONSTRAINT "AdminBackupCode_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
