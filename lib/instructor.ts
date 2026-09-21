import { prisma } from "@/lib/prisma";
import type { CourseLevel, CourseStatus, LessonType } from "@/app/generated/prisma/enums";
import {
  discardLessonMedia,
  inspectLessonUpload,
  isStoredLessonMedia,
  keyBelongsTo,
  lessonMediaKey,
  signLessonUpload,
  type UploadRefusal,
} from "@/lib/lesson-media";

/**
 * Instructor course builder (PRD §10).
 *
 * Prisma bypasses RLS, so ownership is enforced here on every read and every
 * mutation. `assertOwnership` is the single gate — nothing in this module
 * touches a course without passing through it first.
 */

export type ActorRole = "INSTRUCTOR" | "ADMIN" | "SUPER_ADMIN" | string;

export type MutationError = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "LOCKED";

export type Result<T> = { ok: true; data: T } | { ok: false; error: MutationError };

/** Statuses an instructor may set. Approval and publication are admin-only (§10.3). */
const INSTRUCTOR_SETTABLE: CourseStatus[] = ["DRAFT", "SUBMITTED", "ARCHIVED"];

/** Once submitted or live, structure edits need the course pulled back to draft. */
const EDITABLE_STATUSES: CourseStatus[] = ["DRAFT", "ARCHIVED"];

function isAdmin(roles: ActorRole[]): boolean {
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

/**
 * Resolve a course the actor is allowed to modify.
 *
 * Returns NOT_FOUND rather than FORBIDDEN when someone else owns it: an
 * instructor should not be able to enumerate other instructors' course ids.
 */
async function assertOwnership(courseId: string, userId: string, roles: ActorRole[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, instructorId: true, status: true, slug: true },
  });

  if (!course) return { ok: false as const, error: "NOT_FOUND" as const };
  if (course.instructorId !== userId && !isAdmin(roles)) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  return { ok: true as const, data: course };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getInstructorOverview(userId: string) {
  const [courses, enrollmentCount, certificatesIssued, pendingSubmissions, attempts, completion] =
    await Promise.all([
      prisma.course.count({ where: { instructorId: userId } }),
      prisma.enrollment.count({ where: { course: { instructorId: userId } } }),
      prisma.certificate.count({
        where: { status: "ISSUED", enrollment: { course: { instructorId: userId } } },
      }),
      prisma.submission.count({
        where: {
          assignment: { course: { instructorId: userId } },
          status: { in: ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"] },
        },
      }),
      prisma.quizAttempt.findMany({
        where: {
          quiz: { course: { instructorId: userId } },
          status: { in: ["AUTO_GRADED", "GRADED"] },
          score: { not: null },
        },
        select: { score: true, maxScore: true },
      }),
      prisma.enrollment.findMany({
        where: { course: { instructorId: userId } },
        select: { status: true },
      }),
    ]);

  const totalPoints = attempts.reduce((sum, a) => sum + (a.maxScore ?? 0), 0);
  const earnedPoints = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const completed = completion.filter((e) => e.status === "COMPLETED").length;

  return {
    courses,
    students: enrollmentCount,
    certificatesIssued,
    pendingSubmissions,
    averageQuizScore: totalPoints === 0 ? null : Math.round((earnedPoints / totalPoints) * 100),
    completionRate:
      completion.length === 0 ? null : Math.round((completed / completion.length) * 100),
  };
}

export async function getInstructorCourses(userId: string) {
  return prisma.course.findMany({
    where: { instructorId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      level: true,
      priceMinor: true,
      currency: true,
      updatedAt: true,
      submittedAt: true,
      publishedAt: true,
      category: { select: { name: true } },
      _count: { select: { enrollments: true, modules: true } },
    },
  });
}

export async function getCourseForEditing(courseId: string, userId: string, roles: ActorRole[]) {
  const guard = await assertOwnership(courseId, userId, roles);
  if (!guard.ok) return null;

  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      description: true,
      thumbnailUrl: true,
      category: { select: { name: true } },
      status: true,
      level: true,
      priceMinor: true,
      currency: true,
      estimatedMinutes: true,
      categoryId: true,
      minQuizScore: true,
      requiresAssignments: true,
      certificateEnabled: true,
      submittedAt: true,
      publishedAt: true,
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              position: true,
              durationSeconds: true,
              isPreview: true,
              contentUrl: true,
              content: true,
            },
          },
        },
      },
    },
  });
}

/** Enrolled students with progress, for §10.4. */
export async function getCourseStudents(courseId: string, userId: string, roles: ActorRole[]) {
  const guard = await assertOwnership(courseId, userId, roles);
  if (!guard.ok) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      enrolledAt: true,
      completedAt: true,
      user: {
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
    },
  });

  return enrollments.map((enrollment) => ({
    id: enrollment.id,
    email: enrollment.user.email,
    name:
      enrollment.user.profile?.displayName?.trim() ||
      `${enrollment.user.profile?.firstName ?? ""} ${enrollment.user.profile?.lastName ?? ""}`.trim() ||
      enrollment.user.email,
    status: enrollment.status,
    progressPercent: enrollment.progressPercent,
    enrolledAt: enrollment.enrolledAt,
    completedAt: enrollment.completedAt,
  }));
}

// ---------------------------------------------------------------------------
// Course mutations
// ---------------------------------------------------------------------------

export async function createCourse(
  userId: string,
  input: { title: string; categoryId?: string | null; level?: CourseLevel },
): Promise<Result<{ id: string }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "INVALID" };

  const course = await prisma.course.create({
    data: {
      title,
      slug: await uniqueSlug(title),
      instructorId: userId,
      categoryId: input.categoryId || null,
      level: input.level ?? "BEGINNER",
      // New courses always start as drafts; publication is not self-service.
      status: "DRAFT",
    },
    select: { id: true },
  });

  return { ok: true, data: course };
}

export async function updateCourseDetails(
  courseId: string,
  userId: string,
  roles: ActorRole[],
  input: {
    title?: string;
    subtitle?: string | null;
    description?: string | null;
    level?: CourseLevel;
    priceMinor?: number;
    estimatedMinutes?: number | null;
    categoryId?: string | null;
    minQuizScore?: number | null;
    requiresAssignments?: boolean;
    certificateEnabled?: boolean;
  },
): Promise<Result<{ id: string }>> {
  const guard = await assertOwnership(courseId, userId, roles);
  if (!guard.ok) return guard;

  if (input.title !== undefined && !input.title.trim()) return { ok: false, error: "INVALID" };
  if (input.priceMinor !== undefined && (input.priceMinor < 0 || !Number.isInteger(input.priceMinor))) {
    return { ok: false, error: "INVALID" };
  }
  if (input.minQuizScore != null && (input.minQuizScore < 0 || input.minQuizScore > 100)) {
    return { ok: false, error: "INVALID" };
  }

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      title: input.title?.trim(),
      subtitle: input.subtitle,
      description: input.description,
      level: input.level,
      priceMinor: input.priceMinor,
      estimatedMinutes: input.estimatedMinutes,
      categoryId: input.categoryId || null,
      minQuizScore: input.minQuizScore,
      requiresAssignments: input.requiresAssignments,
      certificateEnabled: input.certificateEnabled,
    },
    select: { id: true },
  });

  return { ok: true, data: course };
}

/**
 * Move a course through the publish workflow (§10.3).
 *
 * An instructor may submit for review or withdraw to draft. APPROVED and
 * PUBLISHED are rejected here even for the course owner — the same boundary
 * the RLS policy draws for the browser client.
 */
export async function setCourseStatus(
  courseId: string,
  userId: string,
  roles: ActorRole[],
  status: CourseStatus,
): Promise<Result<{ status: CourseStatus }>> {
  const guard = await assertOwnership(courseId, userId, roles);
  if (!guard.ok) return guard;

  if (!isAdmin(roles) && !INSTRUCTOR_SETTABLE.includes(status)) {
    return { ok: false, error: "FORBIDDEN" };
  }

  if (status === "SUBMITTED") {
    // Submitting an empty course wastes an admin's review cycle.
    const lessonCount = await prisma.lesson.count({ where: { module: { courseId } } });
    if (lessonCount === 0) return { ok: false, error: "INVALID" };
  }

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      status,
      submittedAt: status === "SUBMITTED" ? new Date() : undefined,
      publishedAt: status === "PUBLISHED" ? new Date() : undefined,
      approvedAt: status === "APPROVED" ? new Date() : undefined,
    },
    select: { status: true },
  });

  return { ok: true, data: course };
}

// ---------------------------------------------------------------------------
// Curriculum mutations
// ---------------------------------------------------------------------------

/** Structure edits are refused while a course is under review or live. */
async function assertEditable(courseId: string, userId: string, roles: ActorRole[]) {
  const guard = await assertOwnership(courseId, userId, roles);
  if (!guard.ok) return guard;

  if (!isAdmin(roles) && !EDITABLE_STATUSES.includes(guard.data.status)) {
    return { ok: false as const, error: "LOCKED" as const };
  }

  return guard;
}

export async function addModule(
  courseId: string,
  userId: string,
  roles: ActorRole[],
  title: string,
): Promise<Result<{ id: string }>> {
  const guard = await assertEditable(courseId, userId, roles);
  if (!guard.ok) return guard;
  if (!title.trim()) return { ok: false, error: "INVALID" };

  const last = await prisma.module.findFirst({
    where: { courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const courseModule = await prisma.module.create({
    data: { courseId, title: title.trim(), position: (last?.position ?? 0) + 1 },
    select: { id: true },
  });

  return { ok: true, data: courseModule };
}

export async function deleteModule(
  moduleId: string,
  userId: string,
  roles: ActorRole[],
): Promise<Result<{ courseId: string }>> {
  const courseModule = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { courseId: true, position: true, lessons: { select: { contentUrl: true } } },
  });
  if (!courseModule) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(courseModule.courseId, userId, roles);
  if (!guard.ok) return guard;

  // Compact the remaining positions, or the (courseId, position) unique
  // constraint will collide the next time something is appended.
  await prisma.$transaction([
    prisma.module.delete({ where: { id: moduleId } }),
    // Same two-phase compaction as lessons: (courseId, position) is unique,
    // so a straight decrement can collide mid-statement.
    prisma.$executeRaw`
      UPDATE "modules" SET "position" = -"position"
      WHERE "courseId" = ${courseModule.courseId}::uuid AND "position" > ${courseModule.position}
    `,
    prisma.$executeRaw`
      UPDATE "modules" SET "position" = -"position" - 1
      WHERE "courseId" = ${courseModule.courseId}::uuid AND "position" < 0
    `,
  ]);

  // The cascade removed the lessons; their files are not in the database, so
  // nothing cascades to them.
  await Promise.all(courseModule.lessons.map((lesson) => discardLessonMedia(lesson.contentUrl)));

  return { ok: true, data: { courseId: courseModule.courseId } };
}

/**
 * Move a module one place up or down.
 *
 * The swap runs in a transaction through a temporary negative position:
 * (courseId, position) is unique, so writing the two rows directly would
 * violate the constraint midway.
 */
export async function moveModule(
  moduleId: string,
  userId: string,
  roles: ActorRole[],
  direction: "up" | "down",
): Promise<Result<{ courseId: string }>> {
  const courseModule = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true, courseId: true, position: true },
  });
  if (!courseModule) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(courseModule.courseId, userId, roles);
  if (!guard.ok) return guard;

  const neighbour = await prisma.module.findFirst({
    where: {
      courseId: courseModule.courseId,
      position: direction === "up" ? { lt: courseModule.position } : { gt: courseModule.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true },
  });

  // Already at the end: a no-op, not an error.
  if (!neighbour) return { ok: true, data: { courseId: courseModule.courseId } };

  await prisma.$transaction([
    prisma.module.update({ where: { id: courseModule.id }, data: { position: -1 } }),
    prisma.module.update({ where: { id: neighbour.id }, data: { position: courseModule.position } }),
    prisma.module.update({ where: { id: courseModule.id }, data: { position: neighbour.position } }),
  ]);

  return { ok: true, data: { courseId: courseModule.courseId } };
}

export async function addLesson(
  moduleId: string,
  userId: string,
  roles: ActorRole[],
  input: { title: string; type: LessonType; contentUrl?: string | null; content?: string | null; durationSeconds?: number | null; isPreview?: boolean },
): Promise<Result<{ id: string; courseId: string }>> {
  const courseModule = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { courseId: true },
  });
  if (!courseModule) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(courseModule.courseId, userId, roles);
  if (!guard.ok) return guard;
  if (!input.title.trim()) return { ok: false, error: "INVALID" };
  // A stored file arrives only through the upload flow, which checks it
  // belongs to this lesson. Typed in by hand, a reference is a way to point
  // at someone else's.
  if (isStoredLessonMedia(input.contentUrl)) return { ok: false, error: "INVALID" };

  const last = await prisma.lesson.findFirst({
    where: { moduleId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      title: input.title.trim(),
      type: input.type,
      contentUrl: input.contentUrl || null,
      content: input.content || null,
      durationSeconds: input.durationSeconds ?? null,
      isPreview: input.isPreview ?? false,
      position: (last?.position ?? 0) + 1,
    },
    select: { id: true },
  });

  return { ok: true, data: { id: lesson.id, courseId: courseModule.courseId } };
}

export async function updateLesson(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
  input: { title?: string; type?: LessonType; contentUrl?: string | null; content?: string | null; durationSeconds?: number | null; isPreview?: boolean },
): Promise<Result<{ courseId: string }>> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { contentUrl: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;
  if (input.title !== undefined && !input.title.trim()) return { ok: false, error: "INVALID" };
  // Keeping the lesson's own stored file is fine; naming any other is not.
  // Attaching goes through attachLessonUpload, which checks the file is this
  // lesson's.
  if (isStoredLessonMedia(input.contentUrl) && input.contentUrl !== lesson.contentUrl) {
    return { ok: false, error: "INVALID" };
  }

  // While an uploaded file stays attached, the lesson's type is the file's:
  // it was set from what storage recorded, and a PDF relabelled as a video
  // would reach learners as a player that cannot play it.
  const keepsUpload =
    isStoredLessonMedia(lesson.contentUrl) &&
    (input.contentUrl === undefined || input.contentUrl === lesson.contentUrl);

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      title: input.title?.trim(),
      type: keepsUpload ? undefined : input.type,
      contentUrl: input.contentUrl,
      content: input.content,
      durationSeconds: input.durationSeconds,
      isPreview: input.isPreview,
    },
  });

  // Replaced by a pasted link, or cleared: the uploaded file is no longer
  // anything's, so it goes. After the update, so a failure cannot leave the
  // lesson pointing at nothing.
  if (input.contentUrl !== undefined && input.contentUrl !== lesson.contentUrl) {
    await discardLessonMedia(lesson.contentUrl);
  }

  return { ok: true, data: { courseId: lesson.module.courseId } };
}

export async function deleteLesson(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
): Promise<Result<{ courseId: string }>> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { moduleId: true, position: true, contentUrl: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;

  await prisma.$transaction([
    prisma.lesson.delete({ where: { id: lessonId } }),
    // Two-phase compaction. A plain decrement violates the
    // (moduleId, position) unique constraint whenever Postgres updates a
    // higher row before the one below it has vacated its slot — which depends
    // on physical row order, so it passes on one database and fails on
    // another. Parking the survivors in the negative range first cannot
    // collide, because no live row ever holds a negative position.
    prisma.$executeRaw`
      UPDATE "lessons" SET "position" = -"position"
      WHERE "moduleId" = ${lesson.moduleId}::uuid AND "position" > ${lesson.position}
    `,
    prisma.$executeRaw`
      UPDATE "lessons" SET "position" = -"position" - 1
      WHERE "moduleId" = ${lesson.moduleId}::uuid AND "position" < 0
    `,
  ]);

  await discardLessonMedia(lesson.contentUrl);

  return { ok: true, data: { courseId: lesson.module.courseId } };
}

export async function moveLesson(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
  direction: "up" | "down",
): Promise<Result<{ courseId: string }>> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, moduleId: true, position: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;

  const neighbour = await prisma.lesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      position: direction === "up" ? { lt: lesson.position } : { gt: lesson.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true },
  });

  if (!neighbour) return { ok: true, data: { courseId: lesson.module.courseId } };

  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { position: -1 } }),
    prisma.lesson.update({ where: { id: neighbour.id }, data: { position: lesson.position } }),
    prisma.lesson.update({ where: { id: lesson.id }, data: { position: neighbour.position } }),
  ]);

  return { ok: true, data: { courseId: lesson.module.courseId } };
}

// ---------------------------------------------------------------------------
// Lesson files
// ---------------------------------------------------------------------------

export type UploadError = MutationError | UploadRefusal | "MISSING";

/** The lesson and its course, if the actor may change its content right now. */
async function editableLesson(lessonId: string, userId: string, roles: ActorRole[]) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, contentUrl: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false as const, error: "NOT_FOUND" as const };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;

  return { ok: true as const, data: { ...lesson, courseId: lesson.module.courseId } };
}

/**
 * Step one of an upload: permission to put one file at one key.
 *
 * The same edit rules as any curriculum change — the owner or an admin, and
 * only while the course is in draft. A live course's lessons are what
 * enrolled learners are partway through.
 */
export async function prepareLessonUpload(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
  file: { name: string; type: string; size: number },
): Promise<
  | { ok: true; data: { key: string; url: string; token: string } }
  | { ok: false; error: UploadError; maxBytes?: number }
> {
  const lesson = await editableLesson(lessonId, userId, roles);
  if (!lesson.ok) return lesson;

  const signed = await signLessonUpload({
    courseId: lesson.data.courseId,
    lessonId,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  if (!signed.ok) return signed;

  return { ok: true, data: { key: signed.key, url: signed.url, token: signed.token } };
}

/**
 * Step two: the browser says the upload finished. Attach it to the lesson.
 *
 * Ownership is checked again rather than trusted from step one — this is a
 * separate request, and the key arrives from the browser. It has to sit under
 * this lesson's own prefix, and storage has to confirm a file of an accepted
 * type is really there. The lesson's type follows the file, so a PDF can
 * never be attached to a lesson the player would try to show as a video.
 */
export async function attachLessonUpload(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
  key: string,
): Promise<Result<{ courseId: string }> | { ok: false; error: UploadError }> {
  const lesson = await editableLesson(lessonId, userId, roles);
  if (!lesson.ok) return lesson;

  if (!keyBelongsTo(key, lesson.data.courseId, lessonId)) return { ok: false, error: "FORBIDDEN" };

  const arrived = await inspectLessonUpload(key);
  if (!arrived.ok) return arrived;

  await prisma.lesson.update({
    where: { id: lessonId },
    data: { contentUrl: arrived.ref, type: arrived.lessonType },
  });

  // Replacing a file: the old one belongs to nothing now.
  if (lesson.data.contentUrl !== arrived.ref) await discardLessonMedia(lesson.data.contentUrl);

  return { ok: true, data: { courseId: lesson.data.courseId } };
}

/** Take a lesson's uploaded file off it, and delete the file. */
export async function removeLessonUpload(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
): Promise<Result<{ courseId: string }>> {
  const lesson = await editableLesson(lessonId, userId, roles);
  if (!lesson.ok) return lesson;
  if (!isStoredLessonMedia(lesson.data.contentUrl)) return { ok: true, data: { courseId: lesson.data.courseId } };

  await prisma.lesson.update({ where: { id: lessonId }, data: { contentUrl: null } });
  await discardLessonMedia(lesson.data.contentUrl);

  return { ok: true, data: { courseId: lesson.data.courseId } };
}

/**
 * Who may open a lesson's stored file: anyone enrolled in the course, and the
 * course's own instructor or an admin — the builder needs to show an
 * instructor what they uploaded.
 *
 * Returns the storage key only when access is allowed, and only when the key
 * really is this lesson's; everything else is NOT_FOUND, so the route cannot
 * be used to learn which lessons exist or which have files.
 */
export async function lessonMediaForViewer(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
): Promise<{ ok: true; key: string } | { ok: false }> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      contentUrl: true,
      module: { select: { courseId: true, course: { select: { instructorId: true } } } },
    },
  });
  if (!lesson || !isStoredLessonMedia(lesson.contentUrl)) return { ok: false };

  const courseId = lesson.module.courseId;
  const key = lessonMediaKey(lesson.contentUrl);
  if (!key || !keyBelongsTo(key, courseId, lessonId)) return { ok: false };

  const isOwner = lesson.module.course.instructorId === userId || isAdmin(roles);
  if (isOwner) return { ok: true, key };

  const enrolled = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });
  return enrolled ? { ok: true, key } : { ok: false };
}

/** Slugify, then suffix until free — slug is unique across all courses. */
async function uniqueSlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course";

  let candidate = base;
  let suffix = 1;

  while (await prisma.course.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}
