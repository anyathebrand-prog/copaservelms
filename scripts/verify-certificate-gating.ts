/**
 * Functional checks for what earns a certificate (PRD §11.1).
 *
 * The rule being protected: a certificate says somebody was assessed, so
 * finishing the lessons is not enough. This used to be wrong in a way nothing
 * caught — the quiz condition hung off the optional course.minQuizScore, which
 * was null on six of the eight published courses, so a course with a real
 * certificate-bearing quiz reported the condition "not applicable" and issued
 * on lessons alone.
 *
 * Runs against the real database and the real issuance path, including the
 * PDF and its storage object, and removes everything it created.
 *
 *   npx tsx --env-file=.env scripts/verify-certificate-gating.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { evaluateEligibility } from "../lib/certificates/eligibility";
import { autoIssueCertificate } from "../lib/certificates/auto-issue";
import { markLessonComplete, outstandingAssessment } from "../lib/student";
import { gradeAttempt } from "../lib/quizzes";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];
let storageKey: string | null = null;

function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

function conditionOf(eligibility: Awaited<ReturnType<typeof evaluateEligibility>>, id: string) {
  return eligibility?.conditions.find((c) => c.id === id);
}

async function main() {
  // A real published course that assesses: lessons plus a quiz with questions.
  const course = await prisma.course.findFirst({
    where: {
      status: "PUBLISHED",
      certificateEnabled: true,
      quizzes: { some: { countsTowardCertificate: true, questions: { some: {} } } },
      modules: { some: { lessons: { some: {} } } },
    },
    select: {
      id: true,
      slug: true,
      minQuizScore: true,
      modules: { select: { lessons: { select: { id: true } } } },
      quizzes: {
        where: { countsTowardCertificate: true, questions: { some: {} } },
        select: {
          id: true,
          passingScore: true,
          questions: { select: { id: true, correctAnswer: true } },
        },
      },
    },
  });

  if (!course) {
    check("find a course that assesses", false, "none in the catalogue");
    return finish();
  }
  check("find a course that assesses", true, course.slug);

  const user = await prisma.user.create({
    data: {
      email: `cert-gate-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Gate", lastName: "Check" } },
    },
    select: { id: true },
  });
  users.push(user.id);

  const student = await prisma.role.findUnique({ where: { name: "STUDENT" }, select: { id: true } });
  if (student) await prisma.userRole.create({ data: { userId: user.id, roleId: student.id } });

  const enrollment = await prisma.enrollment.create({
    data: { userId: user.id, courseId: course.id, status: "ACTIVE" },
    select: { id: true },
  });

  const lessons = course.modules.flatMap((m) => m.lessons);
  const quiz = course.quizzes[0]!;

  // --- finishing the lessons is not enough -----------------------------------
  let completion: Awaited<ReturnType<typeof markLessonComplete>> | null = null;
  for (const lesson of lessons) {
    completion = await markLessonComplete(user.id, lesson.id);
  }

  check("every lesson completes", completion?.ok === true && completion.finished === true,
    completion?.ok ? `${completion.progressPercent}%` : "not ok");

  const afterLessons = await evaluateEligibility(enrollment.id);
  check("lessons alone do not earn a certificate", afterLessons?.eligible === false,
    `eligible=${afterLessons?.eligible}`);
  check("and the reason given is the assessment",
    conditionOf(afterLessons, "quizzes")?.met === false,
    conditionOf(afterLessons, "quizzes")?.detail ?? "no condition");
  check("the assessment condition applies at all",
    conditionOf(afterLessons, "quizzes")?.applicable === true,
    "applicable=" + conditionOf(afterLessons, "quizzes")?.applicable);
  check("no certificate was issued on lesson completion",
    (completion?.ok ? completion.certificate : null) === null);

  // --- and the learner is pointed at it --------------------------------------
  check("completion names the outstanding quiz",
    completion?.ok === true && completion.nextQuizId === quiz.id,
    completion?.ok ? String(completion.nextQuizId) : "");
  check("outstandingAssessment agrees",
    (await outstandingAssessment(course.id, enrollment.id)) === quiz.id);

  // --- failing it still does not earn one ------------------------------------
  const wrong = await gradeAttempt(prisma, quiz.id, user.id,
    quiz.questions.map((q) => ({ questionId: q.id, response: "__definitely-wrong__" })));
  check("a failed attempt grades", wrong.ok === true && wrong.result.passed === false,
    wrong.ok ? `${wrong.result.percentage}%` : "not ok");
  check("a failed attempt earns no certificate",
    wrong.ok === true && !wrong.result.certificate);

  const afterFail = await evaluateEligibility(enrollment.id);
  check("still not eligible after failing", afterFail?.eligible === false);

  // --- passing it does -------------------------------------------------------
  const right = await gradeAttempt(prisma, quiz.id, user.id,
    quiz.questions.map((q) => ({ questionId: q.id, response: q.correctAnswer })));
  check("a passing attempt grades as a pass", right.ok === true && right.result.passed === true,
    right.ok ? `${right.result.percentage}%` : "not ok");

  const afterPass = await evaluateEligibility(enrollment.id);
  check("passing makes the enrolment eligible", afterPass?.eligible === true,
    conditionOf(afterPass, "quizzes")?.detail ?? "");

  // gradeAttempt issues on a pass, so by now it should already exist.
  const issued = right.ok ? right.result.certificate : null;
  check("the passing attempt issued the certificate", Boolean(issued),
    issued ? issued.credentialId : "none");

  const stored = await prisma.certificate.findFirst({
    where: { enrollmentId: enrollment.id },
    select: { id: true, certificateNumber: true, credentialId: true },
  });
  check("and it is in the database", Boolean(stored), stored?.credentialId ?? "none");

  // The key is not a column — issue.ts composes it from the owner and the
  // certificate number, so cleanup has to compose it the same way.
  storageKey = stored ? `${user.id}/${stored.certificateNumber}.pdf` : null;

  // Issuing twice must not produce a second certificate.
  const again = await autoIssueCertificate(enrollment.id);
  const count = await prisma.certificate.count({ where: { enrollmentId: enrollment.id } });
  check("issuing again is a no-op", again === null && count === 1, `${count} certificate(s)`);

  return finish();
}

async function cleanup() {
  if (storageKey) {
    try {
      const { getStorage } = await import("../lib/storage");
      await getStorage().remove(storageKey);
    } catch (cause) {
      console.error("could not remove the test PDF", storageKey, (cause as Error).message);
    }
  }

  await prisma.certificate.deleteMany({ where: { enrollment: { userId: { in: users } } } });
  await prisma.quizAttempt.deleteMany({ where: { userId: { in: users } } });
  await prisma.lessonProgress.deleteMany({ where: { enrollment: { userId: { in: users } } } });
  await prisma.enrollment.deleteMany({ where: { userId: { in: users } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log("\n" + passed + "/" + results.length + " passed");
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (cause) => {
    console.error(cause);
    console.log(results.join("\n"));
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
