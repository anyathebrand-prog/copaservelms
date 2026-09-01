
-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'INVITED', 'JOINED', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "organisation" TEXT,
    "interest" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "consentText" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "source" TEXT,
    "unsubscribeToken" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_unsubscribeToken_key" ON "waitlist_entries"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries"("status");

-- CreateIndex
CREATE INDEX "waitlist_entries_createdAt_idx" ON "waitlist_entries"("createdAt");


-- Row Level Security (PRD §6.2 — a hard gate).
--
-- Admin-only, and no public policy at all. The join form writes through the
-- server action's connection, not through PostgREST, so the anon role needs no
-- access here: a public insert policy would let anyone enumerate or flood the
-- table directly against the API, which is exactly what a marketing list must
-- not allow.
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_entries_admin_all" ON "waitlist_entries"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());
