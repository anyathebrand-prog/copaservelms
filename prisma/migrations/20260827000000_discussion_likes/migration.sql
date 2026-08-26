-- CreateTable
CREATE TABLE "discussion_likes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postId" UUID,
    "commentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discussion_likes_postId_idx" ON "discussion_likes"("postId");

-- CreateIndex
CREATE INDEX "discussion_likes_commentId_idx" ON "discussion_likes"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_likes_userId_postId_key" ON "discussion_likes"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_likes_userId_commentId_key" ON "discussion_likes"("userId", "commentId");

-- AddForeignKey
ALTER TABLE "discussion_likes" ADD CONSTRAINT "discussion_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_likes" ADD CONSTRAINT "discussion_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_likes" ADD CONSTRAINT "discussion_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS (PRD §6.2 — no table ships without policies).
--
-- A like is public within the course: participants can see the count and who
-- liked, but only ever create or remove their own.
-- ---------------------------------------------------------------------------

ALTER TABLE "discussion_likes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discussion_likes_select_participants" ON "discussion_likes"
  FOR SELECT TO authenticated
  USING (
    public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.discussion_posts p
      WHERE p."id" = "discussion_likes"."postId"
        AND (public.app_is_enrolled(p."courseId") OR public.app_is_instructor_of(p."courseId"))
    )
    OR EXISTS (
      SELECT 1
      FROM public.comments c
      LEFT JOIN public.discussion_posts p ON p."id" = c."postId"
      WHERE c."id" = "discussion_likes"."commentId"
        AND (
          (p."courseId" IS NOT NULL AND (public.app_is_enrolled(p."courseId") OR public.app_is_instructor_of(p."courseId")))
          OR (c."lessonId" IS NOT NULL AND public.app_is_enrolled(public.app_course_of_lesson(c."lessonId")))
        )
    )
  );

-- A like is an assertion about yourself, so it can only be made as yourself.
CREATE POLICY "discussion_likes_insert_own" ON "discussion_likes"
  FOR INSERT TO authenticated
  WITH CHECK ("userId" = public.app_user_id());

CREATE POLICY "discussion_likes_delete_own" ON "discussion_likes"
  FOR DELETE TO authenticated
  USING ("userId" = public.app_user_id());

-- A like is never edited: it is created or removed.
REVOKE UPDATE ON "discussion_likes" FROM anon, authenticated;
