-- Production roadmap §1 (close the security hole) — last bullet: "Revoke
-- existing admin sessions after deploying the fix."
--
-- Every AdminSession row is a 30-day (remember-me) or 12-hour refresh
-- credential that predates the HttpOnly-cookie deployment. If any token
-- was exfiltrated by the public XSS (or simply lives in a localStorage we
-- can no longer see), it stays server-valid until its expiry. This one-time
-- sweep revokes ALL of them: every admin must log in again on first use
-- after this deploy — the correct, honest cost of closing the hole.
--
-- Idempotent: revoking already-revoked rows is a no-op; on a fresh CI
-- database (or any database where AdminSession is empty) it affects 0 rows.

UPDATE "AdminSession"
SET "revokedAt" = NOW()
WHERE "revokedAt" IS NULL;
