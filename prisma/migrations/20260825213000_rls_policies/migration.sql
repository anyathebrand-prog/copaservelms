-- Row Level Security for CopaServe (PRD §6.2 — RLS-first is a hard gate).
--
-- Threat model: Supabase exposes the `public` schema through PostgREST, so the
-- `anon` and `authenticated` roles can reach every table with the client-side
-- keys. These policies are what stand between those roles and the data.
--
-- Prisma is unaffected. It connects as the table owner (`postgres`), which
-- bypasses RLS, so all server-side queries in the Next.js app keep working
-- exactly as before. That is deliberate: privileged reads (certificate
-- verification, quiz answer keys, admin reports) run through server routes,
-- not through the browser client. We do NOT enable FORCE ROW LEVEL SECURITY,
-- because that would also constrain the owner and break Prisma.

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- All are SECURITY DEFINER so they execute as the owner and bypass RLS. That
-- is required, not incidental: a policy on `users` that reads `users` through
-- an invoker-rights function would recurse infinitely. search_path is pinned
-- to defeat search_path hijacking, which SECURITY DEFINER otherwise invites.
-- ---------------------------------------------------------------------------

-- The public.users.id for the currently authenticated Supabase user.
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u."id"
  FROM public.users u
  WHERE u."supabaseUserId" = auth.uid()
    AND u."deletedAt" IS NULL
  LIMIT 1;
$$;

-- True when the current user holds any of the named roles.
CREATE OR REPLACE FUNCTION public.app_has_any_role(VARIADIC targets TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r."id" = ur."roleId"
    JOIN public.users u ON u."id" = ur."userId"
    WHERE u."supabaseUserId" = auth.uid()
      AND u."deletedAt" IS NULL
      AND r."name"::TEXT = ANY(targets)
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_has_any_role('ADMIN', 'SUPER_ADMIN');
$$;

-- True when the current user owns the given course as its instructor.
CREATE OR REPLACE FUNCTION public.app_is_instructor_of(course UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c."id" = course
      AND c."instructorId" = public.app_user_id()
  );
$$;

-- True when the current user has a live enrollment in the given course.
CREATE OR REPLACE FUNCTION public.app_is_enrolled(course UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e."courseId" = course
      AND e."userId" = public.app_user_id()
      AND e."status" IN ('ACTIVE', 'COMPLETED')
  );
$$;

-- Course that a module / lesson belongs to, for policy predicates.
CREATE OR REPLACE FUNCTION public.app_course_of_module(module UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m."courseId" FROM public.modules m WHERE m."id" = module;
$$;

CREATE OR REPLACE FUNCTION public.app_course_of_lesson(lesson UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m."courseId"
  FROM public.lessons l
  JOIN public.modules m ON m."id" = l."moduleId"
  WHERE l."id" = lesson;
$$;

GRANT EXECUTE ON FUNCTION
  public.app_user_id(),
  public.app_has_any_role(TEXT[]),
  public.app_is_admin(),
  public.app_is_instructor_of(UUID),
  public.app_is_enrolled(UUID),
  public.app_course_of_module(UUID),
  public.app_course_of_lesson(UUID)
TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table. Default-deny: a table with RLS on and no matching
-- policy returns zero rows to anon/authenticated rather than erroring.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modules"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lessons"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_prerequisites"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resources"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_progress"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quizzes"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_attempts"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_answers"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignments"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submissions"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_templates"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificates"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mint_transactions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "live_classes"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "live_class_attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "badges"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "achievements"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discussion_posts"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_logs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE POLICY "users_select_self" ON "users"
  FOR SELECT TO authenticated
  USING ("supabaseUserId" = auth.uid() OR public.app_is_admin());

-- Users may edit their own row but may NOT change status or organization —
-- those are privilege-adjacent and only move through server-side admin paths.
CREATE POLICY "users_update_self" ON "users"
  FOR UPDATE TO authenticated
  USING ("supabaseUserId" = auth.uid())
  WITH CHECK ("supabaseUserId" = auth.uid());

CREATE POLICY "users_admin_all" ON "users"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "roles_select_authenticated" ON "roles"
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "roles_admin_write" ON "roles"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- Role assignment is admin-only; self-service would be privilege escalation.
CREATE POLICY "user_roles_select_self" ON "user_roles"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "user_roles_admin_write" ON "user_roles"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "profiles_select_self" ON "profiles"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "profiles_insert_self" ON "profiles"
  FOR INSERT TO authenticated
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "profiles_update_self" ON "profiles"
  FOR UPDATE TO authenticated
  USING ("userId" = public.app_user_id())
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "profiles_admin_all" ON "profiles"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "organizations_select_member" ON "organizations"
  FOR SELECT TO authenticated
  USING (
    public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."id" = public.app_user_id() AND u."organizationId" = "organizations"."id"
    )
  );

CREATE POLICY "organizations_admin_write" ON "organizations"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- Catalogue — the only genuinely public surface (landing site, course browse)
-- ---------------------------------------------------------------------------

CREATE POLICY "categories_select_public" ON "categories"
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "categories_admin_write" ON "categories"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "courses_select_published" ON "courses"
  FOR SELECT TO anon, authenticated
  USING ("status" = 'PUBLISHED');

CREATE POLICY "courses_select_own" ON "courses"
  FOR SELECT TO authenticated
  USING ("instructorId" = public.app_user_id() OR public.app_is_admin());

-- Instructors author their own courses. Publishing is NOT self-service: the
-- draft → submitted → approved → live workflow (PRD §10.3) is an admin action,
-- enforced here by refusing any instructor write that lands on APPROVED or
-- PUBLISHED.
CREATE POLICY "courses_instructor_insert" ON "courses"
  FOR INSERT TO authenticated
  WITH CHECK (
    "instructorId" = public.app_user_id()
    AND public.app_has_any_role('INSTRUCTOR')
    AND "status" IN ('DRAFT', 'SUBMITTED')
  );

CREATE POLICY "courses_instructor_update" ON "courses"
  FOR UPDATE TO authenticated
  USING ("instructorId" = public.app_user_id())
  WITH CHECK (
    "instructorId" = public.app_user_id()
    AND "status" IN ('DRAFT', 'SUBMITTED', 'ARCHIVED')
  );

CREATE POLICY "courses_admin_all" ON "courses"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- Module list is public for published courses (curriculum preview on the
-- course page); lesson *content* is not.
CREATE POLICY "modules_select_published" ON "modules"
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c."id" = "modules"."courseId" AND c."status" = 'PUBLISHED'
    )
  );

CREATE POLICY "modules_select_privileged" ON "modules"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled("courseId")
    OR public.app_is_instructor_of("courseId")
    OR public.app_is_admin()
  );

CREATE POLICY "modules_instructor_write" ON "modules"
  FOR ALL TO authenticated
  USING (public.app_is_instructor_of("courseId") OR public.app_is_admin())
  WITH CHECK (public.app_is_instructor_of("courseId") OR public.app_is_admin());

-- Anonymous visitors see preview lessons only (PRD §10.3 lesson preview).
CREATE POLICY "lessons_select_preview" ON "lessons"
  FOR SELECT TO anon, authenticated
  USING (
    "isPreview" = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.modules m
      JOIN public.courses c ON c."id" = m."courseId"
      WHERE m."id" = "lessons"."moduleId" AND c."status" = 'PUBLISHED'
    )
  );

CREATE POLICY "lessons_select_enrolled" ON "lessons"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled(public.app_course_of_module("moduleId"))
    OR public.app_is_instructor_of(public.app_course_of_module("moduleId"))
    OR public.app_is_admin()
  );

CREATE POLICY "lessons_instructor_write" ON "lessons"
  FOR ALL TO authenticated
  USING (
    public.app_is_instructor_of(public.app_course_of_module("moduleId"))
    OR public.app_is_admin()
  )
  WITH CHECK (
    public.app_is_instructor_of(public.app_course_of_module("moduleId"))
    OR public.app_is_admin()
  );

CREATE POLICY "lesson_prereqs_select_enrolled" ON "lesson_prerequisites"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled(public.app_course_of_lesson("lessonId"))
    OR public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))
    OR public.app_is_admin()
  );

CREATE POLICY "lesson_prereqs_instructor_write" ON "lesson_prerequisites"
  FOR ALL TO authenticated
  USING (
    public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))
    OR public.app_is_admin()
  )
  WITH CHECK (
    public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))
    OR public.app_is_admin()
  );

CREATE POLICY "resources_select_enrolled" ON "resources"
  FOR SELECT TO authenticated
  USING (
    ("courseId" IS NOT NULL AND (
      public.app_is_enrolled("courseId") OR public.app_is_instructor_of("courseId")))
    OR ("moduleId" IS NOT NULL AND (
      public.app_is_enrolled(public.app_course_of_module("moduleId"))
      OR public.app_is_instructor_of(public.app_course_of_module("moduleId"))))
    OR ("lessonId" IS NOT NULL AND (
      public.app_is_enrolled(public.app_course_of_lesson("lessonId"))
      OR public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))))
    OR public.app_is_admin()
  );

CREATE POLICY "resources_instructor_write" ON "resources"
  FOR ALL TO authenticated
  USING (
    ("courseId" IS NOT NULL AND public.app_is_instructor_of("courseId"))
    OR ("moduleId" IS NOT NULL AND public.app_is_instructor_of(public.app_course_of_module("moduleId")))
    OR ("lessonId" IS NOT NULL AND public.app_is_instructor_of(public.app_course_of_lesson("lessonId")))
    OR public.app_is_admin()
  )
  WITH CHECK (
    ("courseId" IS NOT NULL AND public.app_is_instructor_of("courseId"))
    OR ("moduleId" IS NOT NULL AND public.app_is_instructor_of(public.app_course_of_module("moduleId")))
    OR ("lessonId" IS NOT NULL AND public.app_is_instructor_of(public.app_course_of_lesson("lessonId")))
    OR public.app_is_admin()
  );

-- ---------------------------------------------------------------------------
-- Enrollment & progress
-- ---------------------------------------------------------------------------

CREATE POLICY "enrollments_select_own" ON "enrollments"
  FOR SELECT TO authenticated
  USING (
    "userId" = public.app_user_id()
    OR public.app_is_instructor_of("courseId")
    OR public.app_is_admin()
  );

-- Self-enrollment is allowed only into free published courses. Paid enrollment
-- is created server-side after payment confirmation, so it never depends on a
-- client-side insert.
CREATE POLICY "enrollments_insert_self_free" ON "enrollments"
  FOR INSERT TO authenticated
  WITH CHECK (
    "userId" = public.app_user_id()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c."id" = "enrollments"."courseId"
        AND c."status" = 'PUBLISHED'
        AND c."priceMinor" = 0
    )
  );

CREATE POLICY "enrollments_admin_write" ON "enrollments"
  FOR ALL TO authenticated
  USING (public.app_is_admin() OR public.app_is_instructor_of("courseId"))
  WITH CHECK (public.app_is_admin() OR public.app_is_instructor_of("courseId"));

CREATE POLICY "lesson_progress_own" ON "lesson_progress"
  FOR ALL TO authenticated
  USING ("userId" = public.app_user_id())
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "lesson_progress_select_privileged" ON "lesson_progress"
  FOR SELECT TO authenticated
  USING (
    public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))
    OR public.app_is_admin()
  );

-- ---------------------------------------------------------------------------
-- Assessment
--
-- Note on `questions`: RLS is row-level, not column-level, so any policy that
-- lets a student read a question row also exposes its "correctAnswer". Student
-- quiz delivery therefore goes through a server route that strips the answer
-- key. Direct client reads stay restricted to instructors and admins.
-- ---------------------------------------------------------------------------

CREATE POLICY "quizzes_select_enrolled" ON "quizzes"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled("courseId")
    OR public.app_is_instructor_of("courseId")
    OR public.app_is_admin()
  );

CREATE POLICY "quizzes_instructor_write" ON "quizzes"
  FOR ALL TO authenticated
  USING (public.app_is_instructor_of("courseId") OR public.app_is_admin())
  WITH CHECK (public.app_is_instructor_of("courseId") OR public.app_is_admin());

CREATE POLICY "questions_instructor_only" ON "questions"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q."id" = "questions"."quizId"
        AND (public.app_is_instructor_of(q."courseId") OR public.app_is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q."id" = "questions"."quizId"
        AND (public.app_is_instructor_of(q."courseId") OR public.app_is_admin())
    )
  );

CREATE POLICY "quiz_attempts_own" ON "quiz_attempts"
  FOR ALL TO authenticated
  USING ("userId" = public.app_user_id())
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "quiz_attempts_select_privileged" ON "quiz_attempts"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q."id" = "quiz_attempts"."quizId"
        AND (public.app_is_instructor_of(q."courseId") OR public.app_is_admin())
    )
  );

CREATE POLICY "quiz_answers_own" ON "quiz_answers"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a."id" = "quiz_answers"."attemptId" AND a."userId" = public.app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a."id" = "quiz_answers"."attemptId" AND a."userId" = public.app_user_id()
    )
  );

CREATE POLICY "quiz_answers_select_privileged" ON "quiz_answers"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quiz_attempts a
      JOIN public.quizzes q ON q."id" = a."quizId"
      WHERE a."id" = "quiz_answers"."attemptId"
        AND (public.app_is_instructor_of(q."courseId") OR public.app_is_admin())
    )
  );

CREATE POLICY "assignments_select_enrolled" ON "assignments"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled("courseId")
    OR public.app_is_instructor_of("courseId")
    OR public.app_is_admin()
  );

CREATE POLICY "assignments_instructor_write" ON "assignments"
  FOR ALL TO authenticated
  USING (public.app_is_instructor_of("courseId") OR public.app_is_admin())
  WITH CHECK (public.app_is_instructor_of("courseId") OR public.app_is_admin());

-- Students own their submission rows, but must never write their own grade.
-- Grading columns are set by instructors through the policy below.
CREATE POLICY "submissions_select_own" ON "submissions"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id());

CREATE POLICY "submissions_insert_own" ON "submissions"
  FOR INSERT TO authenticated
  WITH CHECK (
    "userId" = public.app_user_id()
    AND "grade" IS NULL
    AND "gradedById" IS NULL
    AND "gradedAt" IS NULL
  );

CREATE POLICY "submissions_update_own_ungraded" ON "submissions"
  FOR UPDATE TO authenticated
  USING (
    "userId" = public.app_user_id()
    AND "status" IN ('DRAFT', 'SUBMITTED', 'RESUBMITTED', 'RETURNED')
  )
  WITH CHECK (
    "userId" = public.app_user_id()
    AND "grade" IS NULL
    AND "gradedById" IS NULL
  );

CREATE POLICY "submissions_grader_all" ON "submissions"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a."id" = "submissions"."assignmentId"
        AND (public.app_is_instructor_of(a."courseId") OR public.app_is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a."id" = "submissions"."assignmentId"
        AND (public.app_is_instructor_of(a."courseId") OR public.app_is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Certificates & Web3
--
-- Public QR verification (PRD §11.3) is intentionally NOT a policy here.
-- Exposing this table to `anon` would let anyone enumerate every credential
-- and its holder. Verification runs through a server route that looks up a
-- single credential id and returns only the fields §11.3 lists.
-- ---------------------------------------------------------------------------

CREATE POLICY "certificate_templates_admin" ON "certificate_templates"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- Issuance, revocation, and mint-status changes are server-side only: there is
-- deliberately no INSERT or UPDATE policy for the holder.
CREATE POLICY "certificates_select_own" ON "certificates"
  FOR SELECT TO authenticated
  USING (
    "userId" = public.app_user_id()
    OR public.app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e."id" = "certificates"."enrollmentId"
        AND public.app_is_instructor_of(e."courseId")
    )
  );

CREATE POLICY "certificates_admin_write" ON "certificates"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "wallets_own" ON "wallets"
  FOR ALL TO authenticated
  USING ("userId" = public.app_user_id())
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "wallets_admin_select" ON "wallets"
  FOR SELECT TO authenticated
  USING (public.app_is_admin());

-- Mint records are readable by the wallet owner but written only server-side,
-- after the chain confirms — a client-written tokenId or txHash is untrusted.
CREATE POLICY "mint_transactions_select_own" ON "mint_transactions"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE w."id" = "mint_transactions"."walletId" AND w."userId" = public.app_user_id()
    )
    OR public.app_is_admin()
  );

CREATE POLICY "mint_transactions_admin_write" ON "mint_transactions"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- Payments — read-only to the payer; all writes come from webhook handlers.
-- ---------------------------------------------------------------------------

CREATE POLICY "payments_select_own" ON "payments"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "payments_admin_write" ON "payments"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- Live classes
-- ---------------------------------------------------------------------------

CREATE POLICY "live_classes_select_enrolled" ON "live_classes"
  FOR SELECT TO authenticated
  USING (
    public.app_is_enrolled("courseId")
    OR public.app_is_instructor_of("courseId")
    OR public.app_is_admin()
  );

CREATE POLICY "live_classes_instructor_write" ON "live_classes"
  FOR ALL TO authenticated
  USING (public.app_is_instructor_of("courseId") OR public.app_is_admin())
  WITH CHECK (public.app_is_instructor_of("courseId") OR public.app_is_admin());

CREATE POLICY "attendance_select_own" ON "live_class_attendances"
  FOR SELECT TO authenticated
  USING (
    "userId" = public.app_user_id()
    OR public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.live_classes lc
      WHERE lc."id" = "live_class_attendances"."liveClassId"
        AND public.app_is_instructor_of(lc."courseId")
    )
  );

-- Attendance is recorded by the meeting-provider webhook, not the client.
CREATE POLICY "attendance_instructor_write" ON "live_class_attendances"
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.live_classes lc
      WHERE lc."id" = "live_class_attendances"."liveClassId"
        AND public.app_is_instructor_of(lc."courseId")
    )
  )
  WITH CHECK (
    public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.live_classes lc
      WHERE lc."id" = "live_class_attendances"."liveClassId"
        AND public.app_is_instructor_of(lc."courseId")
    )
  );

-- ---------------------------------------------------------------------------
-- Engagement
-- ---------------------------------------------------------------------------

CREATE POLICY "badges_select_public" ON "badges"
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "badges_admin_write" ON "badges"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- Awards are granted by the gamification engine server-side; clients read only.
CREATE POLICY "achievements_select_own" ON "achievements"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "achievements_admin_write" ON "achievements"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

CREATE POLICY "discussion_select_enrolled" ON "discussion_posts"
  FOR SELECT TO authenticated
  USING (
    "deletedAt" IS NULL
    AND (
      public.app_is_enrolled("courseId")
      OR public.app_is_instructor_of("courseId")
      OR public.app_is_admin()
    )
  );

CREATE POLICY "discussion_insert_enrolled" ON "discussion_posts"
  FOR INSERT TO authenticated
  WITH CHECK (
    "authorId" = public.app_user_id()
    AND (public.app_is_enrolled("courseId") OR public.app_is_instructor_of("courseId"))
    -- Pinning and announcements are moderator affordances.
    AND "isPinned" = FALSE
    AND ("isAnnouncement" = FALSE OR public.app_is_instructor_of("courseId"))
  );

CREATE POLICY "discussion_update_own" ON "discussion_posts"
  FOR UPDATE TO authenticated
  USING ("authorId" = public.app_user_id())
  WITH CHECK ("authorId" = public.app_user_id());

CREATE POLICY "discussion_moderate" ON "discussion_posts"
  FOR ALL TO authenticated
  USING (public.app_is_instructor_of("courseId") OR public.app_is_admin())
  WITH CHECK (public.app_is_instructor_of("courseId") OR public.app_is_admin());

CREATE POLICY "comments_select_visible" ON "comments"
  FOR SELECT TO authenticated
  USING (
    "deletedAt" IS NULL
    AND (
      ("postId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.discussion_posts p
        WHERE p."id" = "comments"."postId"
          AND (public.app_is_enrolled(p."courseId") OR public.app_is_instructor_of(p."courseId"))
      ))
      OR ("lessonId" IS NOT NULL AND (
        public.app_is_enrolled(public.app_course_of_lesson("lessonId"))
        OR public.app_is_instructor_of(public.app_course_of_lesson("lessonId"))
      ))
      OR public.app_is_admin()
    )
  );

CREATE POLICY "comments_insert_own" ON "comments"
  FOR INSERT TO authenticated
  WITH CHECK ("authorId" = public.app_user_id());

CREATE POLICY "comments_update_own" ON "comments"
  FOR UPDATE TO authenticated
  USING ("authorId" = public.app_user_id())
  WITH CHECK ("authorId" = public.app_user_id());

CREATE POLICY "comments_moderate" ON "comments"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- Recipients may read their notifications and mark them read; delivery rows are
-- created server-side.
CREATE POLICY "notifications_select_own" ON "notifications"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id());

CREATE POLICY "notifications_update_own" ON "notifications"
  FOR UPDATE TO authenticated
  USING ("userId" = public.app_user_id())
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "notifications_admin_all" ON "notifications"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- Compliance — append-only (PRD §15).
--
-- SELECT and INSERT policies only. With RLS enabled and no UPDATE or DELETE
-- policy, those commands affect zero rows for anon/authenticated, which is the
-- append-only guarantee the PRD asks for. Redaction stays a privileged
-- server-side path.
-- ---------------------------------------------------------------------------

CREATE POLICY "consent_logs_select_own" ON "consent_logs"
  FOR SELECT TO authenticated
  USING ("userId" = public.app_user_id() OR public.app_is_admin());

CREATE POLICY "consent_logs_insert_own" ON "consent_logs"
  FOR INSERT TO authenticated
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "audit_logs_select_admin" ON "audit_logs"
  FOR SELECT TO authenticated
  USING (public.app_is_admin());

-- Belt and braces: even a future policy mistake should not let a client rewrite
-- history in these two tables.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs"   FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON "consent_logs" FROM anon, authenticated;
REVOKE INSERT ON "audit_logs" FROM anon, authenticated;
