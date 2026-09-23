-- Manual slip check: customer uploads the transfer slip for the admin to
-- review. The image reuses the existing SiteSetting image store (immutable,
-- content-addressed) and is referenced by its /api/v1/images/<key> path.
ALTER TABLE "Order" ADD COLUMN "slipImageUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "slipUploadedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "slipAdminNote" TEXT;
