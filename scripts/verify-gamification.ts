/**
 * Functional checks for badges and gamification (PRD §14).
 *
 * The interesting failures here are quiet ones: a badge awarded twice, XP
 * granted for re-completing the same lesson, or a streak that survives a
 * missed day. None of those throw — they just make the numbers wrong, and a
 * leaderboard nobody can trust is worse than no leaderboard.
 *
 *   npx tsx scripts/verify-gamification.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  describeCriteria,
  evaluateBadges,
  getAchievements,
  getLeaderboard,
  recordActivity,
  XP,
} from "../lib/gamification";
import { markLessonComplete } from "../lib/student";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "data-protection" } });

  const teacher = await prisma.user.create({
    data: { email: `gam-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Gam", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const learner = await prisma.user.create({
    data: { email: `gam-learner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Gam", lastName: "Learner" } } },
  });
  createdUsers.push(learner.id);

  const course = await prisma.course.create({
    data: {
      title: `Gamified Course ${RUN}`, slug: `gamified-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id,
      modules: { create: [{ title: "M1", position: 1, lessons: { create: [
        { title: "L1", type: "TEXT", position: 1 },
        { title: "L2", type: "TEXT", position: 2 },
      ] } }] },
    },
    select: { id: true, modules: { select: { lessons: { select: { id: true } } } } },
  });
  createdCourses.push(course.id);

  await prisma.enrollment.create({
    data: { userId: learner.id, courseId: course.id, status: "ACTIVE" },
  });

  const lessons = course.modules.flatMap((m) => m.lessons);

  // --- criteria descriptions ---------------------------------------------
  check("a streak rule describes itself",
    describeCriteria({ type: "streak", days: 7 }).includes("7 consecutive"),
    describeCriteria({ type: "streak", days: 7 }));
  check("a manual badge says so",
    describeCriteria({ type: "manual" }).includes("instructor"),
    describeCriteria({ type: "manual" }));

  // --- XP for lessons -----------------------------------------------------
  const before = await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true },
  });

  await markLessonComplete(learner.id, lessons[0].id);
  const afterFirst = await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true, currentStreak: true },
  });
  check("completing a lesson awards XP",
    afterFirst.xpPoints === before.xpPoints + XP.LESSON_COMPLETED,
    `${before.xpPoints} → ${afterFirst.xpPoints}`);
  check("first activity starts a streak of 1", afterFirst.currentStreak === 1,
    `${afterFirst.currentStreak}d`);

  // Re-completing the same lesson must not pay again.
  await markLessonComplete(learner.id, lessons[0].id);
  const afterRepeat = await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true },
  });
  check("re-completing the same lesson awards no further XP",
    afterRepeat.xpPoints === afterFirst.xpPoints,
    `${afterFirst.xpPoints} → ${afterRepeat.xpPoints}`);

  // --- course completion and badges --------------------------------------
  const finished = await markLessonComplete(learner.id, lessons[1].id);
  check("finishing the course reports completion", finished.ok && finished.finished === true,
    finished.ok ? `${finished.progressPercent}%` : "failed");

  const afterCourse = await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true },
  });
  // Lesson XP + course completion XP + the First Steps badge award.
  check("course completion awards its XP",
    afterCourse.xpPoints >= afterRepeat.xpPoints + XP.LESSON_COMPLETED + XP.COURSE_COMPLETED,
    `${afterRepeat.xpPoints} → ${afterCourse.xpPoints}`);

  const firstSteps = await prisma.achievement.findFirst({
    where: { userId: learner.id, badge: { slug: "first-steps" } },
    select: { xpAwarded: true },
  });
  check("completing a first course awards the First Steps badge",
    firstSteps !== null, firstSteps ? `+${firstSteps.xpAwarded} XP` : "not awarded");

  const notified = await prisma.notification.count({
    where: { userId: learner.id, title: { contains: "Badge earned" } },
  });
  check("the learner is told about a new badge", notified >= 1, `${notified} notification(s)`);

  // --- idempotency --------------------------------------------------------
  const xpBeforeRerun = (await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true },
  })).xpPoints;

  const again = await evaluateBadges(learner.id);
  check("re-evaluating awards nothing already held", again.length === 0, `${again.length} new`);

  const xpAfterRerun = (await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { xpPoints: true },
  })).xpPoints;
  check("re-evaluating does not inflate XP", xpAfterRerun === xpBeforeRerun,
    `${xpBeforeRerun} → ${xpAfterRerun}`);

  const badgeRows = await prisma.achievement.count({
    where: { userId: learner.id, badge: { slug: "first-steps" } },
  });
  check("a badge is held exactly once", badgeRows === 1, `${badgeRows} row(s)`);

  // Concurrent evaluation must not double-award.
  await Promise.all([evaluateBadges(learner.id), evaluateBadges(learner.id), evaluateBadges(learner.id)]);
  const afterConcurrent = await prisma.achievement.count({ where: { userId: learner.id } });
  const distinct = await prisma.achievement.findMany({
    where: { userId: learner.id }, select: { badgeId: true },
  });
  check("concurrent evaluation does not duplicate badges",
    afterConcurrent === new Set(distinct.map((d) => d.badgeId)).size,
    `${afterConcurrent} rows, ${new Set(distinct.map((d) => d.badgeId)).size} distinct`);

  // --- streaks ------------------------------------------------------------
  // Backdate the profile to simulate yesterday's activity.
  const yesterday = new Date(Date.now() - 26 * 3600_000);
  await prisma.profile.update({
    where: { userId: learner.id },
    data: { updatedAt: yesterday, currentStreak: 3 },
  });
  const extended = await recordActivity(learner.id, 0);
  check("activity on a consecutive day extends the streak", extended.currentStreak === 4,
    `3 → ${extended.currentStreak}`);

  // A gap must reset it — this is what makes a streak mean anything.
  //
  // longestStreak is set alongside currentStreak here because a streak earned
  // legitimately passes through recordActivity every day, which keeps the two
  // in step. Setting only currentStreak would be a state the application can
  // never actually produce.
  const lastWeek = new Date(Date.now() - 5 * 86_400_000);
  await prisma.profile.update({
    where: { userId: learner.id },
    data: { updatedAt: lastWeek, currentStreak: 9, longestStreak: 9 },
  });
  const reset = await recordActivity(learner.id, 0);
  check("a missed day resets the streak to 1", reset.currentStreak === 1, `9 → ${reset.currentStreak}`);

  const longest = await prisma.profile.findUniqueOrThrow({
    where: { userId: learner.id }, select: { longestStreak: true },
  });
  check("the longest streak is retained after a reset", longest.longestStreak >= 9,
    `${longest.longestStreak}d`);

  // Same-day activity should not inflate the streak.
  const sameDay = await recordActivity(learner.id, 5);
  check("further activity the same day does not extend the streak",
    sameDay.currentStreak === 1, `${sameDay.currentStreak}d`);

  // --- reads --------------------------------------------------------------
  const { badges, stats } = await getAchievements(learner.id);
  check("achievements list shows earned and locked badges",
    badges.some((b) => b.earned) && badges.some((b) => !b.earned),
    `${stats.earned}/${stats.total} earned`);
  check("locked badges carry a plain-English requirement",
    badges.filter((b) => !b.earned).every((b) => b.requirement.length > 0), "all described");

  const leaderboard = await getLeaderboard(20);
  check("the learner appears on the leaderboard",
    leaderboard.some((entry) => entry.userId === learner.id),
    `${leaderboard.length} ranked`);
  check("the leaderboard excludes people with no XP",
    leaderboard.every((entry) => entry.xpPoints > 0), "all above zero");
  check("the leaderboard is ordered by XP",
    leaderboard.every((entry, i) => i === 0 || leaderboard[i - 1].xpPoints >= entry.xpPoints),
    "descending");

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
