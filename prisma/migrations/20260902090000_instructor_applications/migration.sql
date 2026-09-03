
-- CreateEnum
CREATE TYPE "InstructorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "instructor_applications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "InstructorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "expertise" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "link" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_applications_status_idx" ON "instructor_applications"("status");

-- CreateIndex
CREATE INDEX "instructor_applications_userId_idx" ON "instructor_applications"("userId");

-- AddForeignKey
ALTER TABLE "instructor_applications" ADD CONSTRAINT "instructor_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_applications" ADD CONSTRAINT "instructor_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security (PRD §6.2 — a hard gate).
--
-- An applicant may read their own application, including the reason it was
-- declined: it was written for them. Only an admin sees anyone else's, and only
-- an admin decides one — the update policy is what stops an applicant setting
-- their own status to APPROVED, which would otherwise be a route to the
-- INSTRUCTOR role.
ALTER TABLE "instructor_applications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instructor_applications_admin_all" ON "instructor_applications"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "instructor_applications_select_own" ON "instructor_applications"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id());
