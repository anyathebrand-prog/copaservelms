/**
 * Functional checks for the student portal data layer (PRD §9).
 *
 * These cover the queries the portal pages render from, including the
 * scoping rules that keep one student's data out of another's dashboard —
 * Prisma bypasses RLS, so that isolation is code, not database policy.
 *
 * Expects a local database prepared with migrate + db:seed + seed-demo:
 *   LOCAL=postgres://... npx tsx scripts/verify-student-portal.ts
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

async function main() {
  const student = await prisma.user.findFirstOrThrow({ where: { email: "student@demo.local" } });

  const outsider = await prisma.user.upsert({
    where: { email: "outsider@demo.local" },
    update: {},
    create: {
      email: "outsider@demo.local",
      status: "ACTIVE",
      profile: { create: { firstName: "Mallory", lastName: "Eze" } },
    },
  });

  // --- enrolment scoping --------------------------------------------------
  const courses = await getEnrolledCourses(student.id);
  check("enrolled courses returned", courses.length === 1 && courses[0].slug === "ndpa-foundations",
    `${courses.length} course(s)`);

  const outsiderCourses = await getEnrolledCourses(outsider.id);
  check("non-enrolled user sees no courses", outsiderCourses.length === 0, `${outsiderCourses.length} course(s)`);

  const player = await getCourseForPlayer(student.id, "ndpa-foundations");
  check("player loads for enrolled student", player !== null && player.modules.length === 2,
    player ? `${player.modules.length} modules` : "null");

  const outsiderPlayer = await getCourseForPlayer(outsider.id, "ndpa-foundations");
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
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main();
