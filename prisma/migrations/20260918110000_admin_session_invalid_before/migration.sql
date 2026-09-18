-- Invalidate sessions issued before this instant (epoch millis), used by
-- changeAdminPassword so a concurrent refresh cannot mint a post-revocation
-- session after "log out everywhere".
ALTER TABLE "AdminUser" ADD COLUMN "sessionsInvalidBefore" TIMESTAMP(3);
