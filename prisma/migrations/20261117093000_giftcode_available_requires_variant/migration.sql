-- An `available` GiftCode must belong to a variant.
--
-- Why this exists: production held 13 `available` codes with `variantId IS NULL`
-- (found 2026-11-17). They counted toward every "พร้อมขาย" total while being
-- sellable by nothing, and appeared in no product row — invisible until the
-- admin inventory list learned to surface them.
--
-- The application does not create them: `catalogPurge` detaches only
-- `reserved`/`delivered` codes and DELETES every other status, and both
-- `scripts/purge-test-*.mjs` delete rather than detach. All 13 shared
-- `updatedAt = 2026-11-14 12:37` and no `catalog.product_purge` audit row
-- exists anywhere near that minute, so they were produced by a one-off
-- scripted/manual statement — exactly the class of change no application test
-- can cover.
--
-- So the invariant is enforced where it cannot be bypassed: in the database.
-- A CHECK constraint cannot be used because the 13 legacy rows would violate
-- it (a constraint validates existing data); triggers only judge each new
-- write, so this can be applied before those rows are retired. Retiring one
-- still works — it writes `status = 'voided'`, which these triggers allow.
--
-- The one thing worth knowing when this fires: the fix is never to null the
-- variant, it is to retire the code (admin → คลังสินค้า → โค้ดที่ไม่มีสินค้า)
-- or to attach it to a real variant.

CREATE TRIGGER `GiftCode_available_requires_variant_ins`
BEFORE INSERT ON `GiftCode`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'available' AND NEW.`variantId` IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'GiftCode: an available code must belong to a variant (variantId is NULL)';
  END IF;
END;

CREATE TRIGGER `GiftCode_available_requires_variant_upd`
BEFORE UPDATE ON `GiftCode`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'available' AND NEW.`variantId` IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'GiftCode: an available code must belong to a variant (variantId is NULL)';
  END IF;
END;
