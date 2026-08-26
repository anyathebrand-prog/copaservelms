-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'PORTABILITY', 'OBJECTION', 'WITHDRAW_CONSENT');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "details" TEXT,
    "resolution" TEXT,
    "handledById" UUID,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_subject_requests_userId_idx" ON "data_subject_requests"("userId");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_idx" ON "data_subject_requests"("status");

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS for the new table (PRD §6.2 — no table ships without policies).
--
-- Subjects may raise and read their own requests. They may never set status or
-- resolution: that is the record of how the controller discharged its
-- obligation, and a subject who could write it could fabricate compliance.
-- ---------------------------------------------------------------------------

ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_requests_select_own" ON "data_subject_requests"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "data_requests_insert_own" ON "data_subject_requests"
  FOR INSERT TO authenticated
  WITH CHECK (
    "userId" = public.app_user_id()
    AND "status" = 'PENDING'
    AND "resolution" IS NULL
    AND "handledById" IS NULL
  );

CREATE POLICY "data_requests_admin_all" ON "data_subject_requests"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- A submitted request is evidence that a right was exercised, so subjects
-- cannot delete their own trail.
REVOKE DELETE ON "data_subject_requests" FROM anon, authenticated;
