import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";

/**
 * Gamification and digital badges (PRD §14).
 *
 * Badges are awarded by evaluating rules against what a learner has actually
 * done, not by incrementing a counter at the call site. That matters because
 * the same achievement can be reached by several routes — finishing a course,
 * an admin issuing a certificate manually, a bulk enrolment completing — and a
 * rule evaluated centrally cannot be forgotten in one of them.
 *
 * Awards are idempotent: (userId, badgeId) is unique, so re-running the
 * evaluation is safe and is in fact how badges are backfilled after a new one
 * is defined.
 */

/** Machine-readable award rules, stored on Badge.criteria. */
export type BadgeCriteria =
  | { type: "course_completed"; courseId?: string }
  | { type: "courses_completed"; count: number }
  | { type: "category_completed"; categorySlug: string; count: number }
  | { type: "certificates_earned"; count: number }
  | { type: "quiz_average"; minimum: number; attempts: number }
  | { type: "streak"; days: number }
  | { type: "manual" };

export type AwardedBadge = { badgeId: string; name: string; xpValue: number };

/** XP for things a learner does, kept in one place so it stays consistent. */
export const XP = {
  LESSON_COMPLETED: 10,
  QUIZ_PASSED: 25,
  ASSIGNMENT_SUBMITTED: 15,
  COURSE_COMPLETED: 100,
  CERTIFICATE_EARNED: 150,
} as const;

/**
 * Add XP and keep the learning streak current.
 *
 * The streak counts consecutive days with activity. It is derived from the
 * last activity date rather than a nightly job: a job that fails silently
 * leaves every streak wrong, whereas this is only ever computed when there is
 * something to compute.
 */
export async function recordActivity(
  userId: string,
  xp: number,
  minutes = 0,
): Promise<{ xpPoints: number; currentStreak: number }> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { xpPoints: true, currentStreak: true, longestStreak: true, learningMinutes: true, updatedAt: true },
  });

  if (!profile) return { xpPoints: 0, currentStreak: 0 };

  const today = startOfDay(new Date());
  const last = startOfDay(profile.updatedAt);
  const dayGap = Math.round((today.getTime() - last.getTime()) / 86_400_000);

  // Same day: streak unchanged. Next day: extend. Anything longer: reset to 1,
  // because the point of a streak is that a missed day breaks it.
  const currentStreak =
    dayGap === 0 ? Math.max(1, profile.currentStreak) : dayGap === 1 ? profile.currentStreak + 1 : 1;

  const updated = await prisma.profile.update({
    where: { userId },
    data: {
      xpPoints: { increment: xp },
      learningMinutes: { increment: minutes },
      currentStreak,
      longestStreak: Math.max(profile.longestStreak, currentStreak),
    },
    select: { xpPoints: true, currentStreak: true },
  });

  return updated;
}

/**
 * Evaluate every badge rule for one learner and award what they have earned.
 *
 * Returns only newly awarded badges, so a caller can tell the learner about
 * them without re-announcing everything they already hold.
 */
export async function evaluateBadges(userId: string): Promise<AwardedBadge[]> {
  const [badges, held, enrolments, certificates, attempts, profile] = await Promise.all([
    prisma.badge.findMany({
      select: { id: true, name: true, slug: true, criteria: true, xpValue: true, courseId: true },
    }),
    prisma.achievement.findMany({ where: { userId }, select: { badgeId: true } }),
    prisma.enrollment.findMany({
      where: { userId, status: "COMPLETED" },
      select: { courseId: true, course: { select: { category: { select: { slug: true } } } } },
    }),
    prisma.certificate.count({ where: { userId, status: "ISSUED" } }),
    prisma.quizAttempt.findMany({
      where: { userId, status: { in: ["AUTO_GRADED", "GRADED"] }, score: { not: null } },
      select: { score: true, maxScore: true },
    }),
    prisma.profile.findUnique({ where: { userId }, select: { currentStreak: true, longestStreak: true } }),
  ]);

  const heldIds = new Set(held.map((h) => h.badgeId));
  const completedCourseIds = new Set(enrolments.map((e) => e.courseId));

  const byCategory = new Map<string, number>();
  for (const enrolment of enrolments) {
    const slug = enrolment.course.category?.slug;
    if (slug) byCategory.set(slug, (byCategory.get(slug) ?? 0) + 1);
  }

  const points = attempts.reduce((sum, a) => sum + (a.maxScore ?? 0), 0);
  const earned = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const quizAverage = points === 0 ? null : Math.round((earned / points) * 100);

  const awarded: AwardedBadge[] = [];

  for (const badge of badges) {
    if (heldIds.has(badge.id)) continue;

    const criteria = (badge.criteria ?? {}) as Partial<BadgeCriteria> & { type?: string };
    // A badge with no rule is awarded by hand, never automatically.
    if (!criteria.type || criteria.type === "manual") continue;

    if (!meetsCriteria(criteria as BadgeCriteria, {
      completedCourseIds,
      completedCount: enrolments.length,
      byCategory,
      certificates,
      quizAverage,
      attemptCount: attempts.length,
      streak: Math.max(profile?.currentStreak ?? 0, profile?.longestStreak ?? 0),
      badgeCourseId: badge.courseId,
    })) {
      continue;
    }

    try {
      await prisma.$transaction([
        prisma.achievement.create({
          data: { userId, badgeId: badge.id, xpAwarded: badge.xpValue, context: { auto: true } as never },
        }),
        prisma.profile.update({
          where: { userId },
          data: { xpPoints: { increment: badge.xpValue } },
        }),
      ]);

      awarded.push({ badgeId: badge.id, name: badge.name, xpValue: badge.xpValue });
    } catch (error) {
      // A unique violation means a concurrent evaluation awarded it first,
      // which is success. Anything else is a real failure and must surface.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  for (const badge of awarded) {
    await sendNotification({
      userId,
      // Earning a badge is a record of what the learner did, not promotion.
      kind: "assignment.graded",
      title: `Badge earned: ${badge.name}`,
      body: `You have earned the ${badge.name} badge (+${badge.xpValue} XP).`,
      actionUrl: "/student/achievements",
    }).catch(() => {});
  }

  return awarded;
}

type Facts = {
  completedCourseIds: Set<string>;
  completedCount: number;
  byCategory: Map<string, number>;
  certificates: number;
  quizAverage: number | null;
  attemptCount: number;
  streak: number;
  badgeCourseId: string | null;
};

function meetsCriteria(criteria: BadgeCriteria, facts: Facts): boolean {
  switch (criteria.type) {
    case "course_completed": {
      // The rule may name a course, or inherit the badge's own course link.
      const courseId = criteria.courseId ?? facts.badgeCourseId;
      return courseId !== null && courseId !== undefined && facts.completedCourseIds.has(courseId);
    }
    case "courses_completed":
      return facts.completedCount >= criteria.count;
    case "category_completed":
      return (facts.byCategory.get(criteria.categorySlug) ?? 0) >= criteria.count;
    case "certificates_earned":
      return facts.certificates >= criteria.count;
    case "quiz_average":
      // Requires a minimum number of attempts, so one lucky quiz is not mastery.
      return (
        facts.attemptCount >= criteria.attempts &&
        facts.quizAverage !== null &&
        facts.quizAverage >= criteria.minimum
      );
    case "streak":
      return facts.streak >= criteria.days;
    default:
      return false;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAchievements(userId: string) {
  const [badges, held, profile] = await Promise.all([
    prisma.badge.findMany({
      orderBy: { xpValue: "desc" },
      select: {
        id: true, name: true, slug: true, description: true, imageUrl: true,
        xpValue: true, criteria: true, isMintable: true,
        course: { select: { title: true } },
      },
    }),
    prisma.achievement.findMany({
      where: { userId },
      select: { badgeId: true, earnedAt: true, xpAwarded: true },
    }),
    prisma.profile.findUnique({
      where: { userId },
      select: { xpPoints: true, currentStreak: true, longestStreak: true, learningMinutes: true },
    }),
  ]);

  const heldMap = new Map(held.map((h) => [h.badgeId, h]));

  return {
    // Locked badges are shown too: knowing what is available is most of the
    // motivation, and hiding them makes the set feel arbitrary.
    badges: badges.map((badge) => ({
      ...badge,
      earned: heldMap.has(badge.id),
      earnedAt: heldMap.get(badge.id)?.earnedAt ?? null,
      requirement: describeCriteria((badge.criteria ?? {}) as BadgeCriteria, badge.course?.title),
    })),
    stats: {
      xpPoints: profile?.xpPoints ?? 0,
      currentStreak: profile?.currentStreak ?? 0,
      longestStreak: profile?.longestStreak ?? 0,
      learningMinutes: profile?.learningMinutes ?? 0,
      earned: held.length,
      total: badges.length,
    },
  };
}

/** Plain-English requirement, so a locked badge explains itself. */
export function describeCriteria(criteria: BadgeCriteria, courseTitle?: string): string {
  switch (criteria.type) {
    case "course_completed":
      return courseTitle ? `Complete ${courseTitle}` : "Complete the linked course";
    case "courses_completed":
      return `Complete ${criteria.count} course${criteria.count === 1 ? "" : "s"}`;
    case "category_completed":
      return `Complete ${criteria.count} courses in ${criteria.categorySlug.replaceAll("-", " ")}`;
    case "certificates_earned":
      return `Earn ${criteria.count} certificate${criteria.count === 1 ? "" : "s"}`;
    case "quiz_average":
      return `Average ${criteria.minimum}% across ${criteria.attempts} quizzes`;
    case "streak":
      return `Learn on ${criteria.days} consecutive days`;
    default:
      return "Awarded by an instructor";
  }
}

/**
 * Leaderboard (§14).
 *
 * Shows display names only, and only for learners who have earned XP — a
 * board listing everyone with zero is noise, and it would expose the full user
 * list to anyone who can see the page.
 */
export async function getLeaderboard(limit = 20) {
  const profiles = await prisma.profile.findMany({
    where: { xpPoints: { gt: 0 }, user: { deletedAt: null, status: "ACTIVE" } },
    orderBy: { xpPoints: "desc" },
    take: limit,
    select: {
      userId: true, firstName: true, lastName: true, displayName: true,
      xpPoints: true, currentStreak: true,
      user: { select: { organization: { select: { name: true } } } },
    },
  });

  return profiles.map((profile, index) => ({
    rank: index + 1,
    userId: profile.userId,
    name: profile.displayName?.trim() || `${profile.firstName} ${profile.lastName}`.trim() || "Learner",
    organisation: profile.user.organization?.name ?? null,
    xpPoints: profile.xpPoints,
    currentStreak: profile.currentStreak,
  }));
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
