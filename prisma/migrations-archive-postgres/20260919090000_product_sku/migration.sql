-- Product SKU (nullable first, backfilled, then kept nullable for flexibility)
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;

-- Backfill from slug upper-snake so every product gets a real code immediately
UPDATE "Product" SET "sku" = UPPER(REPLACE("slug", '-', '_')) WHERE "sku" IS NULL;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
