-- Admin challenge single-use enforcement: records sha256 hashes of consumed
-- step-1 login-challenge JWTs so a replayed challenge cannot mint a session.
CREATE TABLE "AdminChallengeConsumed" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminChallengeConsumed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminChallengeConsumed_tokenHash_key" ON "AdminChallengeConsumed"("tokenHash");
CREATE INDEX "AdminChallengeConsumed_consumedAt_idx" ON "AdminChallengeConsumed"("consumedAt");
