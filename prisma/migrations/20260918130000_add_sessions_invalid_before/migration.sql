-- Add sessionsInvalidBefore to AdminUser (see model comment).
ALTER TABLE "AdminUser" ADD COLUMN "sessionsInvalidBefore" TIMESTAMP(3);
