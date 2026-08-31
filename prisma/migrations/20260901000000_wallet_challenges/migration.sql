-- CreateTable
CREATE TABLE "wallet_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_challenges_nonce_key" ON "wallet_challenges"("nonce");

-- CreateIndex
CREATE INDEX "wallet_challenges_userId_idx" ON "wallet_challenges"("userId");

-- CreateIndex
CREATE INDEX "wallet_challenges_expiresAt_idx" ON "wallet_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "wallet_challenges" ADD CONSTRAINT "wallet_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS (PRD §6.2 — no table ships without policies).
--
-- Challenges are issued and consumed by the server. A client has no reason to
-- read or write them: being able to read another person's nonce would let you
-- present their challenge to your own wallet, and being able to write one
-- would let you mint a challenge for an address you do not control.
-- ---------------------------------------------------------------------------

ALTER TABLE "wallet_challenges" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_challenges_admin_only" ON "wallet_challenges"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

REVOKE SELECT, INSERT, UPDATE, DELETE ON "wallet_challenges" FROM anon, authenticated;
