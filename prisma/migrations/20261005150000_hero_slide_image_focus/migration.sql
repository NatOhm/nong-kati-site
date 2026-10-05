-- HeroSlide focal point: which part of the banner survives object-cover.
-- Nullable on purpose — NULL means centred, so existing slides render
-- exactly as they did before and no backfill is needed.
ALTER TABLE "HeroSlide" ADD COLUMN "imageFocus" TEXT;