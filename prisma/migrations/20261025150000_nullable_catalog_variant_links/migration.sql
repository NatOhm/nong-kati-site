-- Catalog hard-delete keeps history: `DELETE /admin/products/:id` must not
-- destroy an order's line items or a delivered gift code just because their
-- catalog variant row is going away (client-approved hard-delete plan,
-- 2026-10-13; the required FK made that impossible, so the columns become
-- nullable and the purge DETACHES instead of deleting).
--
-- Additive and safe: DROP NOT NULL only. Existing rows keep their values;
-- the app starts writing NULL only at purge time. Restrict stays, so a
-- variant still referenced by a non-detached row cannot be deleted by
-- accident — detachment is always an explicit statement.
ALTER TABLE "OrderItem" ALTER COLUMN "variantId" DROP NOT NULL;
ALTER TABLE "GiftCode" ALTER COLUMN "variantId" DROP NOT NULL;
