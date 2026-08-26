import { prisma } from "@/lib/prisma";
import type { CourseLevel, CourseStatus, LessonType } from "@/app/generated/prisma/enums";

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
    select: { courseId: true, position: true },
  });
  if (!courseModule) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(courseModule.courseId, userId, roles);
  if (!guard.ok) return guard;

  // Compact the remaining positions, or the (courseId, position) unique
  // constraint will collide the next time something is appended.
  await prisma.$transaction([
    prisma.module.delete({ where: { id: moduleId } }),
    prisma.module.updateMany({
      where: { courseId: courseModule.courseId, position: { gt: courseModule.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);

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
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;
  if (input.title !== undefined && !input.title.trim()) return { ok: false, error: "INVALID" };

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      title: input.title?.trim(),
      type: input.type,
      contentUrl: input.contentUrl,
      content: input.content,
      durationSeconds: input.durationSeconds,
      isPreview: input.isPreview,
    },
  });

  return { ok: true, data: { courseId: lesson.module.courseId } };
}

export async function deleteLesson(
  lessonId: string,
  userId: string,
  roles: ActorRole[],
): Promise<Result<{ courseId: string }>> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { moduleId: true, position: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertEditable(lesson.module.courseId, userId, roles);
  if (!guard.ok) return guard;

  await prisma.$transaction([
    prisma.lesson.delete({ where: { id: lessonId } }),
    prisma.lesson.updateMany({
      where: { moduleId: lesson.moduleId, position: { gt: lesson.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);

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
