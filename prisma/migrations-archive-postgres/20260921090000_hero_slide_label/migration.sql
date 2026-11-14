-- Hero slides absorb the old ticker's promo role: a slide can now be a
-- text deal card (label only, no image) or an image banner with a deal chip.
ALTER TABLE "HeroSlide" ALTER COLUMN "imageUrl" DROP NOT NULL;
ALTER TABLE "HeroSlide" ADD COLUMN IF NOT EXISTS "label" TEXT;
