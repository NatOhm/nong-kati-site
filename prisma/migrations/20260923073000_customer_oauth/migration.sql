-- OAuth sign-in (Google/LINE): customers created via a social provider have
-- no local password. passwordHash becomes nullable; password login must
-- treat NULL as "no password set" (reject with INVALID_CREDENTIALS).
ALTER TABLE "Customer" ALTER COLUMN "passwordHash" DROP NOT NULL;
