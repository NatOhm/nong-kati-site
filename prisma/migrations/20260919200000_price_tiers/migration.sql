-- Member/dealer price tiers (client feedback: ระบบราคาสมาชิก/ตัวแทนจำหน่าย)
-- NULL tier prices fall back to the base retail price.
ALTER TABLE "ProductVariant" ADD COLUMN "memberPrice" DECIMAL(10, 2);
ALTER TABLE "ProductVariant" ADD COLUMN "dealerPrice" DECIMAL(10, 2);
ALTER TABLE "Customer" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'retail';
CREATE INDEX "Customer_tier_idx" ON "Customer"("tier");
