-- Expand-only migration for promotion, coupon, VAT, and per-line order snapshots.
-- Keep Promotion.productIds during the compatibility release; drop it only in
-- a later contract migration after every old reader/writer is retired.
-- Validate this migration against disposable PostgreSQL before release.

-- Promotion is present in the pre-change Prisma schema but absent from the
-- checked-in migration history. Create it for fresh installs and preserve it
-- for existing databases. Retain productIds for the old application build.
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'selected',
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "productIds" TEXT,
    "minSpendThb" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- Older installations may have created Promotion without this compatibility
-- column. Add it empty; never discard it in the expand migration.
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "productIds" TEXT;
CREATE INDEX IF NOT EXISTS "Promotion_isActive_expiresAt_idx"
    ON "Promotion"("isActive", "expiresAt");
CREATE INDEX IF NOT EXISTS "Promotion_startsAt_expiresAt_idx"
    ON "Promotion"("startsAt", "expiresAt");

-- Reject malformed/ambiguous selected-product data before backfill. Empty
-- arrays are valid and intentionally produce no PromotionProduct associations.
-- Missing product IDs are rejected instead of silently widening/narrowing a
-- promotion's scope. All-scope promotions do not use productIds.
DO $$
DECLARE
    promo RECORD;
    parsed_ids JSON;
BEGIN
    IF EXISTS (
        SELECT 1 FROM "Promotion"
        WHERE "scope" NOT IN ('all', 'selected')
    ) THEN
        RAISE EXCEPTION 'Promotion contains an unsupported scope value';
    END IF;

    FOR promo IN
        SELECT "id", "productIds"
        FROM "Promotion"
        WHERE "scope" = 'selected' AND "productIds" IS NOT NULL
    LOOP
        BEGIN
            parsed_ids := promo."productIds"::JSON;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Promotion % has malformed productIds JSON', promo."id";
        END;

        IF json_typeof(parsed_ids) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Promotion % productIds must be a JSON array', promo."id";
        END IF;

        IF EXISTS (
            SELECT 1
            FROM json_array_elements(parsed_ids) AS entry(value)
            WHERE json_typeof(entry.value) IS DISTINCT FROM 'string'
               OR btrim(entry.value #>> '{}') = ''
        ) THEN
            RAISE EXCEPTION 'Promotion % productIds must contain non-empty string IDs', promo."id";
        END IF;

        IF EXISTS (
            SELECT product_id
            FROM json_array_elements_text(parsed_ids) AS entry(product_id)
            GROUP BY product_id
            HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION 'Promotion % productIds contains duplicate IDs', promo."id";
        END IF;

        IF EXISTS (
            SELECT 1
            FROM json_array_elements_text(parsed_ids) AS entry(product_id)
            WHERE NOT EXISTS (
                SELECT 1 FROM "Product" product WHERE product."id" = entry.product_id
            )
        ) THEN
            RAISE EXCEPTION 'Promotion % productIds references a missing product', promo."id";
        END IF;
    END LOOP;
END $$;

-- Historical line totals are pre-coupon. Refuse contradictory order snapshots
-- rather than capping or inventing allocations. VAT over the post-discount
-- total is impossible to represent as non-negative line VAT/ex-VAT evidence.
DO $$
DECLARE
    bad_order TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM "OrderItem" WHERE "lineTotalThb" < 0) THEN
        RAISE EXCEPTION 'OrderItem contains a negative lineTotalThb';
    END IF;

    SELECT o."orderNumber" INTO bad_order
    FROM "Order" o
    LEFT JOIN (
        SELECT "orderId", SUM("lineTotalThb") AS line_total
        FROM "OrderItem"
        GROUP BY "orderId"
    ) item_totals ON item_totals."orderId" = o."id"
    WHERE o."subtotalThb" < 0
       OR o."discountThb" < 0
       OR o."discountThb" > o."subtotalThb"
       OR o."totalAmountThb" <> o."subtotalThb" - o."discountThb"
       OR o."vatAmountThb" < 0
       OR o."vatAmountThb" > o."totalAmountThb"
       OR COALESCE(item_totals.line_total, 0) <> o."subtotalThb"
    LIMIT 1;

    IF bad_order IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has inconsistent subtotal, discount, total, VAT, or item lines', bad_order;
    END IF;
END $$;

-- Normalize selected promotion product associations while retaining the legacy
-- JSON column for compatibility with the previous deployed reader.
CREATE TABLE "PromotionProduct" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PromotionProduct_promotion_id_fkey"
        FOREIGN KEY ("promotion_id") REFERENCES "Promotion"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromotionProduct_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "Product"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PromotionProduct_promotion_id_product_id_key"
    ON "PromotionProduct"("promotion_id", "product_id");
CREATE INDEX "PromotionProduct_product_id_idx"
    ON "PromotionProduct"("product_id");

INSERT INTO "PromotionProduct" ("id", "promotion_id", "product_id")
SELECT gen_random_uuid()::TEXT, promo."id", product_ids.product_id
FROM "Promotion" promo
CROSS JOIN LATERAL json_array_elements_text(promo."productIds"::JSON)
    AS product_ids(product_id)
WHERE promo."scope" = 'selected'
  AND promo."productIds" IS NOT NULL;

-- Order-level snapshots. Historical non-zero VAT was calculated at the legacy
-- fixed 7% inclusive rate. Zero-VAT rows remain disabled with unknown rate.
ALTER TABLE "Order"
    ADD COLUMN "promotionDiscountThb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "vatRate" DECIMAL(5,4);

UPDATE "Order"
SET "vatEnabled" = ("vatAmountThb" > 0),
    "vatRate" = CASE WHEN "vatAmountThb" > 0 THEN 0.0700 ELSE NULL END;

-- Immutable promotion evidence and final coupon/VAT line snapshots.
ALTER TABLE "OrderItem"
    ADD COLUMN "originalUnitPriceThb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "appliedPromotionId" TEXT,
    ADD COLUMN "promotionName" TEXT,
    ADD COLUMN "promotionType" TEXT,
    ADD COLUMN "promotionValue" DECIMAL(10,2),
    ADD COLUMN "promotionDiscountThb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "couponDiscountThb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "finalLineTotalThb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "finalLineExVat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "finalLineVatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Orders without coupons retain their existing line total.
UPDATE "OrderItem" item
SET "couponDiscountThb" = 0,
    "finalLineTotalThb" = item."lineTotalThb"
FROM "Order" ord
WHERE ord."id" = item."orderId"
  AND ord."discountThb" = 0;

-- Allocate coupon discounts in integer satang per order using the largest
-- remainder method. Every order receives exactly its discount amount, with no
-- cross-order windows and no per-line cap that could silently lose satang.
WITH proportional AS (
    SELECT
        item."id" AS item_id,
        item."orderId" AS order_id,
        ROUND(item."lineTotalThb" * 100)::BIGINT AS line_cents,
        ROUND(ord."discountThb" * 100)::BIGINT AS discount_cents,
        SUM(ROUND(item."lineTotalThb" * 100)::BIGINT)
            OVER (PARTITION BY item."orderId") AS subtotal_cents
    FROM "OrderItem" item
    JOIN "Order" ord ON ord."id" = item."orderId"
    WHERE ord."discountThb" > 0
), exact_shares AS (
    SELECT *, (line_cents::NUMERIC * discount_cents / subtotal_cents) AS exact_cents
    FROM proportional
), base_shares AS (
    SELECT *, FLOOR(exact_cents)::BIGINT AS base_cents,
           exact_cents - FLOOR(exact_cents) AS fractional_cent
    FROM exact_shares
), ranked_shares AS (
    SELECT *,
           discount_cents - SUM(base_cents) OVER (PARTITION BY order_id) AS remainder_cents,
           ROW_NUMBER() OVER (
               PARTITION BY order_id
               ORDER BY fractional_cent DESC, item_id
           ) AS remainder_rank
    FROM base_shares
), allocations AS (
    SELECT item_id,
           (base_cents + CASE WHEN remainder_rank <= remainder_cents THEN 1 ELSE 0 END)::NUMERIC / 100 AS coupon_thb
    FROM ranked_shares
)
UPDATE "OrderItem" item
SET "couponDiscountThb" = allocations.coupon_thb,
    "finalLineTotalThb" = item."lineTotalThb" - allocations.coupon_thb
FROM allocations
WHERE item."id" = allocations.item_id;

-- Orders with zero VAT retain final totals as their ex-VAT amount.
UPDATE "OrderItem" item
SET "finalLineVatAmount" = 0,
    "finalLineExVat" = item."finalLineTotalThb"
FROM "Order" ord
WHERE ord."id" = item."orderId"
  AND ord."vatAmountThb" = 0;

-- Allocate historical order VAT in satang across positive final lines using the
-- largest remainder method. Zero-value lines stay zero; impossible VAT totals
-- were rejected by preflight above.
WITH proportional AS (
    SELECT
        item."id" AS item_id,
        item."orderId" AS order_id,
        ROUND(item."finalLineTotalThb" * 100)::BIGINT AS line_cents,
        ROUND(ord."vatAmountThb" * 100)::BIGINT AS vat_cents,
        SUM(ROUND(item."finalLineTotalThb" * 100)::BIGINT)
            OVER (PARTITION BY item."orderId") AS total_cents
    FROM "OrderItem" item
    JOIN "Order" ord ON ord."id" = item."orderId"
    WHERE ord."vatAmountThb" > 0
      AND item."finalLineTotalThb" > 0
), exact_shares AS (
    SELECT *, (line_cents::NUMERIC * vat_cents / total_cents) AS exact_cents
    FROM proportional
), base_shares AS (
    SELECT *, FLOOR(exact_cents)::BIGINT AS base_cents,
           exact_cents - FLOOR(exact_cents) AS fractional_cent
    FROM exact_shares
), ranked_shares AS (
    SELECT *,
           vat_cents - SUM(base_cents) OVER (PARTITION BY order_id) AS remainder_cents,
           ROW_NUMBER() OVER (
               PARTITION BY order_id
               ORDER BY fractional_cent DESC, item_id
           ) AS remainder_rank
    FROM base_shares
), allocations AS (
    SELECT item_id,
           (base_cents + CASE WHEN remainder_rank <= remainder_cents THEN 1 ELSE 0 END)::NUMERIC / 100 AS vat_thb
    FROM ranked_shares
)
UPDATE "OrderItem" item
SET "finalLineVatAmount" = allocations.vat_thb,
    "finalLineExVat" = item."finalLineTotalThb" - allocations.vat_thb
FROM allocations
WHERE item."id" = allocations.item_id;

-- Executable migration assertions. Abort instead of accepting contradictory
-- snapshots or silently trimming historical values.
DO $$
DECLARE
    bad_order TEXT;
BEGIN
    SELECT ord."orderNumber" INTO bad_order
    FROM "Order" ord
    LEFT JOIN "OrderItem" item ON item."orderId" = ord."id"
    GROUP BY ord."id", ord."orderNumber", ord."subtotalThb", ord."discountThb",
             ord."totalAmountThb", ord."vatAmountThb"
    HAVING COALESCE(SUM(item."couponDiscountThb"), 0) <> ord."discountThb"
        OR COALESCE(SUM(item."finalLineTotalThb"), 0) <> ord."totalAmountThb"
        OR COALESCE(SUM(item."finalLineVatAmount"), 0) <> ord."vatAmountThb"
        OR COALESCE(SUM(item."finalLineExVat"), 0) <> ord."totalAmountThb" - ord."vatAmountThb"
    LIMIT 1;

    IF bad_order IS NOT NULL THEN
        RAISE EXCEPTION 'Order % failed line snapshot reconciliation', bad_order;
    END IF;

    IF EXISTS (
        SELECT 1 FROM "OrderItem"
        WHERE "originalUnitPriceThb" < 0
           OR "promotionDiscountThb" < 0
           OR "couponDiscountThb" < 0
           OR "finalLineTotalThb" < 0
           OR "finalLineExVat" < 0
           OR "finalLineVatAmount" < 0
           OR "promotionValue" < 0
    ) THEN
        RAISE EXCEPTION 'OrderItem contains a negative snapshot value';
    END IF;
END $$;

-- Enforce non-negative snapshots for future writes.
ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_originalUnitPriceThb_non_negative"
        CHECK ("originalUnitPriceThb" >= 0),
    ADD CONSTRAINT "OrderItem_promotionDiscountThb_non_negative"
        CHECK ("promotionDiscountThb" >= 0),
    ADD CONSTRAINT "OrderItem_couponDiscountThb_non_negative"
        CHECK ("couponDiscountThb" >= 0),
    ADD CONSTRAINT "OrderItem_finalLineTotalThb_non_negative"
        CHECK ("finalLineTotalThb" >= 0),
    ADD CONSTRAINT "OrderItem_finalLineExVat_non_negative"
        CHECK ("finalLineExVat" >= 0),
    ADD CONSTRAINT "OrderItem_finalLineVatAmount_non_negative"
        CHECK ("finalLineVatAmount" >= 0),
    ADD CONSTRAINT "OrderItem_promotionValue_non_negative"
        CHECK ("promotionValue" IS NULL OR "promotionValue" >= 0);

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_promotionDiscountThb_non_negative"
        CHECK ("promotionDiscountThb" >= 0);

-- Deny direct client-role access unless an explicit policy/grant is added.
--
-- Pre-flight guard (fail closed). ENABLE ROW LEVEL SECURITY with no policies is
-- safe for the application only because the connecting role OWNS these tables
-- (or is superuser / has BYPASSRLS) and Postgres exempts owners from plain RLS.
-- 20260927200000_rls_baseline records the same rule for the other 36 tables and
-- deliberately does NOT use FORCE ROW LEVEL SECURITY for exactly this reason.
--
-- The failure mode this guards against is silent, not loud: if Promotion already
-- exists in this database and was created by a DIFFERENT role than the one
-- Prisma connects as, CREATE TABLE IF NOT EXISTS above is a no-op, the app is
-- not the owner, and every promotion read returns ZERO ROWS instead of an error.
-- The storefront would simply stop showing promotions, with nothing in the logs.
-- Aborting here means the deploy fails and the previous release keeps serving
-- instead of shipping an empty promotion table.
DO $$
DECLARE
    t RECORD;
    can_bypass BOOLEAN;
BEGIN
    can_bypass := EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
    );

    FOR t IN
        SELECT c.relname AS table_name, owner.rolname AS owner_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_roles owner ON owner.oid = c.relowner
        WHERE n.nspname = 'public'
          AND c.relname IN ('Promotion', 'PromotionProduct')
    LOOP
        IF NOT can_bypass
           AND t.owner_name::text IS DISTINCT FROM current_user::text THEN
            RAISE EXCEPTION
                'Refusing to enable RLS on public.%: current role % is not the owner (owned by %) and has neither superuser nor BYPASSRLS. Enabling RLS with no policies would make the application read zero rows from this table. Connect as the owner, or add a reviewed, narrowly scoped policy for the application role in a new migration before enabling RLS.',
                t.table_name, current_user, t.owner_name;
        END IF;
    END LOOP;
END $$;

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionProduct" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Promotion", public."PromotionProduct" FROM PUBLIC;
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOR role_name IN
        SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'supabase_realtime_admin')
    LOOP
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public.%I, public.%I FROM %I',
            'Promotion', 'PromotionProduct', role_name
        );
    END LOOP;
END $$;