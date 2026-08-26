import { prisma } from "@/lib/prisma";

/**
 * Student portal data access (PRD §9).
 *
 * These run as the table owner through Prisma, so every function takes the
 * caller's userId explicitly and scopes on it. There is no ambient "current
 * user" here — an unscoped query would silently bypass the isolation that RLS
 * provides to the browser client.
 */

export type DashboardSummary = {
  activeCourses: number;
  completedCourses: number;
  assignmentsDue: number;
  quizAverage: number | null;
  certificatesEarned: number;
  learningMinutes: number;
  currentStreak: number;
  xpPoints: number;
  overallProgress: number;
  achievements: { id: string; name: string; imageUrl: string | null; earnedAt: Date }[];
};

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [enrollments, certificatesEarned, profile, achievements, attempts, assignmentsDue] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        select: { status: true, progressPercent: true },
      }),
      prisma.certificate.count({ where: { userId, status: "ISSUED" } }),
      prisma.profile.findUnique({
        where: { userId },
        select: { learningMinutes: true, currentStreak: true, xpPoints: true },
      }),
      prisma.achievement.findMany({
        where: { userId },
        orderBy: { earnedAt: "desc" },
        take: 6,
        select: { id: true, earnedAt: true, badge: { select: { name: true, imageUrl: true } } },
      }),
      // Only graded attempts carry a meaningful score; in-progress ones would
      // drag the average toward zero.
      prisma.quizAttempt.findMany({
        where: { userId, status: { in: ["AUTO_GRADED", "GRADED"] }, score: { not: null } },
        select: { score: true, maxScore: true },
      }),
      countAssignmentsDue(userId),
    ]);

  const active = enrollments.filter((e) => e.status === "ACTIVE");
  const completed = enrollments.filter((e) => e.status === "COMPLETED");

  const totalPoints = attempts.reduce((sum, a) => sum + (a.maxScore ?? 0), 0);
  const earnedPoints = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);

  return {
    activeCourses: active.length,
    completedCourses: completed.length,
    assignmentsDue,
    quizAverage: totalPoints === 0 ? null : Math.round((earnedPoints / totalPoints) * 100),
    certificatesEarned,
    learningMinutes: profile?.learningMinutes ?? 0,
    currentStreak: profile?.currentStreak ?? 0,
    xpPoints: profile?.xpPoints ?? 0,
    overallProgress:
      enrollments.length === 0
        ? 0
        : Math.round(enrollments.reduce((sum, e) => sum + e.progressPercent, 0) / enrollments.length),
    achievements: achievements.map((a) => ({
      id: a.id,
      name: a.badge.name,
      imageUrl: a.badge.imageUrl,
      earnedAt: a.earnedAt,
    })),
  };
}

/**
 * Assignments in enrolled courses with no submitted work and a future due date.
 *
 * COMPLETED enrolments count too: finishing every lesson does not discharge an
 * outstanding assignment, and a required one still gates certificate
 * eligibility (§11.1). Scoping this to ACTIVE would hide real work.
 */
async function countAssignmentsDue(userId: string): Promise<number> {
  return prisma.assignment.count({
    where: {
      course: { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } },
      OR: [{ dueAt: null }, { dueAt: { gte: new Date() } }],
      submissions: {
        none: { userId, status: { in: ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "GRADED"] } },
      },
    },
  });
}

export type EnrolledCourse = {
  enrollmentId: string;
  courseId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  categoryName: string | null;
  instructorName: string;
  status: string;
  progressPercent: number;
  lessonsTotal: number;
  lessonsCompleted: number;
  estimatedMinutesRemaining: number | null;
};

export async function getEnrolledCourses(userId: string): Promise<EnrolledCourse[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          subtitle: true,
          thumbnailUrl: true,
          category: { select: { name: true } },
          instructor: { select: { profile: { select: { displayName: true, firstName: true, lastName: true } } } },
          modules: { select: { lessons: { select: { id: true, durationSeconds: true } } } },
        },
      },
      lessonProgress: { where: { completed: true }, select: { lessonId: true } },
    },
  });

  return enrollments.map((enrollment) => {
    const lessons = enrollment.course.modules.flatMap((m) => m.lessons);
    const completedIds = new Set(enrollment.lessonProgress.map((p) => p.lessonId));
    const remainingSeconds = lessons
      .filter((lesson) => !completedIds.has(lesson.id))
      .reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0);

    return {
      enrollmentId: enrollment.id,
      courseId: enrollment.course.id,
      title: enrollment.course.title,
      slug: enrollment.course.slug,
      subtitle: enrollment.course.subtitle,
      thumbnailUrl: enrollment.course.thumbnailUrl,
      categoryName: enrollment.course.category?.name ?? null,
      instructorName: formatName(enrollment.course.instructor.profile),
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
      lessonsTotal: lessons.length,
      lessonsCompleted: completedIds.size,
      estimatedMinutesRemaining: remainingSeconds > 0 ? Math.round(remainingSeconds / 60) : null,
    };
  });
}

/**
 * Full course structure for the player, with the caller's per-lesson progress.
 *
 * Returns null when the caller is not enrolled — the same answer a missing
 * course gives, so the player cannot be used to probe the catalogue.
 */
export async function getCourseForPlayer(userId: string, slug: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, course: { slug }, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: {
      id: true,
      progressPercent: true,
      status: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          modules: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              position: true,
              lessons: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  type: true,
                  position: true,
                  durationSeconds: true,
                  contentUrl: true,
                  content: true,
                },
              },
            },
          },
          quizzes: { select: { id: true, title: true, lessonId: true } },
        },
      },
      lessonProgress: { select: { lessonId: true, completed: true, lastPositionSeconds: true } },
    },
  });

  if (!enrollment) return null;

  const progressByLesson = new Map(enrollment.lessonProgress.map((p) => [p.lessonId, p]));

  return {
    enrollmentId: enrollment.id,
    status: enrollment.status,
    progressPercent: enrollment.progressPercent,
    course: enrollment.course,
    modules: enrollment.course.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        completed: progressByLesson.get(lesson.id)?.completed ?? false,
        lastPositionSeconds: progressByLesson.get(lesson.id)?.lastPositionSeconds ?? 0,
      })),
    })),
  };
}

export async function getStudentCertificates(userId: string) {
  return prisma.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      certificateNumber: true,
      credentialId: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      pdfUrl: true,
      mintStatus: true,
      enrollment: { select: { course: { select: { title: true } } } },
    },
  });
}

export async function getStudentQuizzes(userId: string) {
  const quizzes = await prisma.quiz.findMany({
    where: { course: { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      passingScore: true,
      maxAttempts: true,
      timeLimitMinutes: true,
      course: { select: { title: true, slug: true } },
      _count: { select: { questions: true } },
      attempts: {
        where: { userId },
        orderBy: { attemptNumber: "desc" },
        select: { id: true, status: true, score: true, maxScore: true, passed: true, submittedAt: true },
      },
    },
  });

  return quizzes.map((quiz) => ({
    ...quiz,
    attemptsUsed: quiz.attempts.length,
    bestAttempt: quiz.attempts.reduce<(typeof quiz.attempts)[number] | null>(
      (best, attempt) => ((attempt.score ?? -1) > (best?.score ?? -1) ? attempt : best),
      null,
    ),
  }));
}

export async function getStudentAssignments(userId: string) {
  return prisma.assignment.findMany({
    where: { course: { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } } },
    orderBy: [{ dueAt: "asc" }],
    select: {
      id: true,
      title: true,
      instructions: true,
      dueAt: true,
      maxPoints: true,
      course: { select: { title: true, slug: true } },
      submissions: {
        where: { userId },
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { id: true, status: true, grade: true, feedback: true, submittedAt: true },
      },
    },
  });
}

/**
 * Mark a lesson complete and recompute course progress.
 *
 * Progress is derived from lesson_progress rather than incremented, so a
 * double submission or a replayed request cannot inflate it.
 */
export async function markLessonComplete(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, module: { select: { courseId: true } } },
  });

  if (!lesson) return { ok: false as const, error: "NOT_FOUND" as const };

  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId: lesson.module.courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });

  if (!enrollment) return { ok: false as const, error: "NOT_ENROLLED" as const };

  await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    update: { completed: true, completedAt: new Date() },
    create: { enrollmentId: enrollment.id, lessonId, userId, completed: true, completedAt: new Date() },
  });

  const [totalLessons, completedLessons] = await Promise.all([
    prisma.lesson.count({ where: { module: { courseId: lesson.module.courseId } } }),
    prisma.lessonProgress.count({ where: { enrollmentId: enrollment.id, completed: true } }),
  ]);

  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);
  const finished = totalLessons > 0 && completedLessons >= totalLessons;

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      progressPercent,
      // Completion flips the enrollment, which is what certificate eligibility
      // keys off (§11.1). Issuance itself stays a separate, admin-gated step.
      status: finished ? "COMPLETED" : undefined,
      completedAt: finished ? new Date() : undefined,
    },
  });

  return { ok: true as const, progressPercent, finished };
}

function formatName(
  profile: { displayName: string | null; firstName: string; lastName: string } | null,
): string {
  if (!profile) return "Unknown";
  return profile.displayName?.trim() || `${profile.firstName} ${profile.lastName}`.trim();
}
