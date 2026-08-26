import { prisma } from "@/lib/prisma";

/**
 * Certificate eligibility (PRD §11.1).
 *
 * A certificate is issued only when ALL applicable conditions are met:
 * every lesson complete, minimum quiz score achieved, required assignments
 * submitted, attendance met where the course sets it, and admin approval where
 * the course requires it.
 *
 * Each condition reports separately rather than collapsing to a boolean, so a
 * student can be told precisely what is outstanding and an admin can see why a
 * certificate has not been issued.
 */

export type Condition = {
  id: "lessons" | "quizzes" | "assignments" | "attendance" | "approval";
  label: string;
  met: boolean;
  /** Human-readable current state, e.g. "8/10 lessons". */
  detail: string;
  /** False when the course does not impose this condition at all. */
  applicable: boolean;
};

export type Eligibility = {
  enrollmentId: string;
  courseTitle: string;
  studentName: string;
  eligible: boolean;
  /** True when the only unmet condition is admin approval. */
  awaitingApproval: boolean;
  conditions: Condition[];
  alreadyIssued: boolean;
  certificateId: string | null;
};

export async function evaluateEligibility(enrollmentId: string): Promise<Eligibility | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      userId: true,
      user: {
        select: {
          profile: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          certificateEnabled: true,
          minQuizScore: true,
          requiresAssignments: true,
          minAttendanceRate: true,
          requiresAdminApproval: true,
        },
      },
      certificate: { select: { id: true, status: true } },
    },
  });

  if (!enrollment) return null;

  const { course, userId } = enrollment;

  const [totalLessons, completedLessons, attempts, requiredAssignments, submittedAssignments, liveClasses, attended] =
    await Promise.all([
      prisma.lesson.count({ where: { module: { courseId: course.id } } }),
      prisma.lessonProgress.count({ where: { enrollmentId, completed: true } }),
      prisma.quizAttempt.findMany({
        where: {
          enrollmentId,
          status: { in: ["AUTO_GRADED", "GRADED"] },
          quiz: { countsTowardCertificate: true },
        },
        select: { quizId: true, score: true, maxScore: true },
      }),
      prisma.assignment.count({ where: { courseId: course.id, isRequiredForCertificate: true } }),
      prisma.submission.count({
        where: {
          enrollmentId,
          status: { in: ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "GRADED"] },
          assignment: { isRequiredForCertificate: true },
        },
      }),
      prisma.liveClass.count({ where: { courseId: course.id } }),
      prisma.liveClassAttendance.count({
        where: { userId, attended: true, liveClass: { courseId: course.id } },
      }),
    ]);

  // Best score per quiz, not every attempt: a failed first attempt should not
  // drag down a later pass.
  const bestByQuiz = new Map<string, number>();
  for (const attempt of attempts) {
    if (!attempt.maxScore) continue;
    const pct = Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100);
    bestByQuiz.set(attempt.quizId, Math.max(bestByQuiz.get(attempt.quizId) ?? 0, pct));
  }
  const quizScores = [...bestByQuiz.values()];
  const averageQuiz =
    quizScores.length === 0
      ? null
      : Math.round(quizScores.reduce((sum, s) => sum + s, 0) / quizScores.length);

  const attendanceRate = liveClasses === 0 ? null : Math.round((attended / liveClasses) * 100);

  const conditions: Condition[] = [
    {
      id: "lessons",
      label: "All lessons completed",
      applicable: totalLessons > 0,
      met: totalLessons > 0 && completedLessons >= totalLessons,
      detail: `${completedLessons}/${totalLessons} lessons`,
    },
    {
      id: "quizzes",
      label: `Minimum quiz score${course.minQuizScore ? ` of ${course.minQuizScore}%` : ""}`,
      applicable: course.minQuizScore != null,
      // A course that demands a score but has no graded attempt is not met —
      // absence of a quiz result is not a pass.
      met:
        course.minQuizScore == null ||
        (averageQuiz !== null && averageQuiz >= course.minQuizScore),
      detail: averageQuiz === null ? "no graded quizzes yet" : `${averageQuiz}% average`,
    },
    {
      id: "assignments",
      label: "Required assignments submitted",
      applicable: course.requiresAssignments && requiredAssignments > 0,
      met:
        !course.requiresAssignments ||
        requiredAssignments === 0 ||
        submittedAssignments >= requiredAssignments,
      detail: `${submittedAssignments}/${requiredAssignments} submitted`,
    },
    {
      id: "attendance",
      label: `Attendance${course.minAttendanceRate ? ` of ${course.minAttendanceRate}%` : ""}`,
      applicable: course.minAttendanceRate != null && liveClasses > 0,
      met:
        course.minAttendanceRate == null ||
        liveClasses === 0 ||
        (attendanceRate !== null && attendanceRate >= course.minAttendanceRate),
      detail: attendanceRate === null ? "no live classes" : `${attendanceRate}% attended`,
    },
    {
      id: "approval",
      label: "Admin approval",
      applicable: course.requiresAdminApproval,
      // Approval is the one condition the student cannot satisfy themselves; it
      // is met by an admin issuing the certificate, so it reads as unmet until
      // then.
      met: !course.requiresAdminApproval,
      detail: course.requiresAdminApproval ? "pending admin approval" : "not required",
    },
  ];

  const applicable = conditions.filter((c) => c.applicable);
  const unmet = applicable.filter((c) => !c.met);
  const profile = enrollment.user.profile;

  return {
    enrollmentId,
    courseTitle: course.title,
    studentName:
      profile?.displayName?.trim() ||
      `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() ||
      "Unknown",
    // A course with certificates switched off is never eligible.
    eligible: course.certificateEnabled && unmet.length === 0,
    awaitingApproval:
      course.certificateEnabled && unmet.length === 1 && unmet[0].id === "approval",
    conditions,
    alreadyIssued: enrollment.certificate !== null,
    certificateId: enrollment.certificate?.id ?? null,
  };
}

/** Enrolments that have met every condition but have no certificate yet. */
export async function findIssuableEnrollments(courseId?: string) {
  const candidates = await prisma.enrollment.findMany({
    where: {
      certificate: null,
      course: { certificateEnabled: true, ...(courseId ? { id: courseId } : {}) },
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: { id: true },
    take: 500,
  });

  const evaluated = await Promise.all(candidates.map((c) => evaluateEligibility(c.id)));

  return evaluated.filter(
    (e): e is Eligibility => e !== null && (e.eligible || e.awaitingApproval),
  );
}
