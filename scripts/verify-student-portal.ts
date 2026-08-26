/**
 * Functional checks for the student portal data layer (PRD §9).
 *
 * These cover the queries the portal pages render from, including the
 * scoping rules that keep one student's data out of another's dashboard —
 * Prisma bypasses RLS, so that isolation is code, not database policy.
 *
 * Provisions its own fixtures, namespaced per run and removed afterwards, so
 * it runs against any migrated database rather than depending on seed-demo
 * having been run first.
 *
 *   DATABASE_URL=... LOCAL=$DATABASE_URL npx tsx scripts/verify-student-portal.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  getCourseForPlayer,
  getDashboardSummary,
  getEnrolledCourses,
  getStudentAssignments,
  getStudentQuizzes,
  markLessonComplete,
} from "../lib/student";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.LOCAL }) });

const results: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

const RUN = Math.random().toString(36).slice(2, 8);
const createdUsers: string[] = [];
const createdCourses: string[] = [];

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `sp-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Tunde", lastName: "Bakare" } } },
  });
  createdUsers.push(teacher.id);

  const student = await prisma.user.create({
    data: { email: `sp-student-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Chidi", lastName: "Nwosu" } } },
  });
  createdUsers.push(student.id);

  const outsider = await prisma.user.create({
    data: { email: `sp-outsider-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Mallory", lastName: "Eze" } } },
  });
  createdUsers.push(outsider.id);

  const course = await prisma.course.create({
    data: {
      title: `NDPA Foundations ${RUN}`, slug: `ndpa-foundations-${RUN}`,
      status: "PUBLISHED", instructorId: teacher.id, categoryId: category.id,
      minQuizScore: 70,
      modules: {
        create: [
          { title: "Foundations", position: 1, lessons: { create: [
            { title: "What the NDPA covers", type: "TEXT", position: 1, durationSeconds: 600 },
            { title: "Lawful bases", type: "TEXT", position: 2, durationSeconds: 900 },
          ] } },
          { title: "In practice", position: 2, lessons: { create: [
            { title: "Data subject rights", type: "TEXT", position: 1, durationSeconds: 720 },
            { title: "Breach response", type: "TEXT", position: 2, durationSeconds: 840 },
          ] } },
        ],
      },
      assignments: { create: [{ title: "Case study", maxPoints: 100 }] },
      quizzes: { create: [{ title: "Foundations check", passingScore: 70, questions: { create: [
        { type: "TRUE_FALSE", position: 1, points: 1, prompt: "Q1", correctAnswer: true },
        { type: "TRUE_FALSE", position: 2, points: 1, prompt: "Q2", correctAnswer: true },
        { type: "TRUE_FALSE", position: 3, points: 1, prompt: "Q3", correctAnswer: true },
        { type: "TRUE_FALSE", position: 4, points: 1, prompt: "Q4", correctAnswer: true },
      ] } }] },
    },
    select: { id: true, slug: true },
  });
  createdCourses.push(course.id);

  await prisma.enrollment.create({
    data: { userId: student.id, courseId: course.id, status: "ACTIVE" },
  });

  const SLUG = course.slug;

  // --- enrolment scoping --------------------------------------------------
  const courses = await getEnrolledCourses(student.id);
  check("enrolled courses returned", courses.length === 1 && courses[0].slug === SLUG,
    `${courses.length} course(s)`);

  const outsiderCourses = await getEnrolledCourses(outsider.id);
  check("non-enrolled user sees no courses", outsiderCourses.length === 0, `${outsiderCourses.length} course(s)`);

  const player = await getCourseForPlayer(student.id, SLUG);
  check("player loads for enrolled student", player !== null && player.modules.length === 2,
    player ? `${player.modules.length} modules` : "null");

  const outsiderPlayer = await getCourseForPlayer(outsider.id, SLUG);
  check("player denied for non-enrolled user", outsiderPlayer === null, `${outsiderPlayer === null ? "null" : "leaked"}`);

  // --- progress -----------------------------------------------------------
  const lessons = player!.modules.flatMap((m) => m.lessons);
  const first = await markLessonComplete(student.id, lessons[0].id);
  check("marking a lesson updates progress", first.ok && first.progressPercent === 25,
    first.ok ? `${first.progressPercent}%` : `error=${first.error}`);

  // Progress is derived, not incremented, so replaying must be a no-op.
  const replay = await markLessonComplete(student.id, lessons[0].id);
  check("re-marking is idempotent", replay.ok && replay.progressPercent === 25,
    replay.ok ? `${replay.progressPercent}%` : `error=${replay.error}`);

  const cheat = await markLessonComplete(outsider.id, lessons[0].id);
  check("non-enrolled user cannot mark progress", !cheat.ok && cheat.error === "NOT_ENROLLED",
    cheat.ok ? "accepted!" : `error=${cheat.error}`);

  for (const lesson of lessons.slice(1)) {
    await markLessonComplete(student.id, lesson.id);
  }
  const finished = await markLessonComplete(student.id, lessons[0].id);
  check("finishing every lesson completes the enrolment", finished.ok && finished.finished === true && finished.progressPercent === 100,
    finished.ok ? `${finished.progressPercent}% finished=${finished.finished}` : "n/a");

  const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { userId: student.id } });
  check("enrolment status flips to COMPLETED", enrollment.status === "COMPLETED" && enrollment.completedAt !== null,
    `status=${enrollment.status}`);

  // --- dashboard ----------------------------------------------------------
  const summary = await getDashboardSummary(student.id);
  check("dashboard counts completed course", summary.completedCourses === 1 && summary.activeCourses === 0,
    `active=${summary.activeCourses} completed=${summary.completedCourses}`);
  check("dashboard progress reflects lessons", summary.overallProgress === 100, `${summary.overallProgress}%`);
  check("quiz average is null before any attempt", summary.quizAverage === null, `${summary.quizAverage}`);
  check("assignments due counted", summary.assignmentsDue === 1, `${summary.assignmentsDue} due`);

  const emptySummary = await getDashboardSummary(outsider.id);
  check("dashboard is empty for a new user", emptySummary.activeCourses === 0 && emptySummary.overallProgress === 0,
    `active=${emptySummary.activeCourses} progress=${emptySummary.overallProgress}%`);

  // --- listings -----------------------------------------------------------
  const quizzes = await getStudentQuizzes(student.id);
  check("quizzes listed for enrolled course", quizzes.length === 1 && quizzes[0]._count.questions === 4,
    `${quizzes.length} quiz, ${quizzes[0]?._count.questions} questions`);

  const outsiderQuizzes = await getStudentQuizzes(outsider.id);
  check("quizzes hidden from non-enrolled user", outsiderQuizzes.length === 0, `${outsiderQuizzes.length}`);

  const assignments = await getStudentAssignments(student.id);
  check("assignments listed for enrolled course", assignments.length === 1, `${assignments.length}`);

  const outsiderAssignments = await getStudentAssignments(outsider.id);
  check("assignments hidden from non-enrolled user", outsiderAssignments.length === 0, `${outsiderAssignments.length}`);

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
