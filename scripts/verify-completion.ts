/**
 * Functional checks for what happens when a learner finishes a course
 * (PRD §9.4, §11.1).
 *
 * The gap this covers was found by a person clicking, not by a test: finishing
 * every lesson flipped the enrolment to COMPLETED and made the learner fully
 * eligible for a certificate, and then nothing issued it. Eligibility became
 * true and waited for an administrator who had no reason to look.
 *
 * So the property under test is that earning a certificate and receiving one
 * are the same event — except where a course deliberately asks a human to
 * approve it, which is the entire point of that setting.
 *
 * Updated when the rule changed: finishing the lessons no longer earns a
 * certificate on a course that assesses. The passing attempt is what earns it,
 * so that is the event this now expects to produce one.
 *
 *   npx tsx --env-file=.env scripts/verify-completion.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { markLessonComplete } from "../lib/student";
import { gradeAttempt } from "../lib/quizzes";
import { evaluateEligibility } from "../lib/certificates/eligibility";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];
const courses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  // The PDF as well as the row. Deleting only the row leaves the file behind
  // in the bucket, and a verification script that litters storage every run is
  // a slow leak nobody notices.
  const issued = await prisma.certificate.findMany({
    where: { userId: { in: users } },
    select: { certificateNumber: true, userId: true },
  });

  if (issued.length > 0) {
    try {
      const { getStorage } = await import("../lib/storage");
      const storage = getStorage();
      for (const certificate of issued) {
        await storage
          .remove(`${certificate.userId}/${certificate.certificateNumber}.pdf`)
          .catch(() => undefined);
      }
    } catch {
      // Storage not configured in this environment; the rows still go.
    }
  }

  await prisma.certificate.deleteMany({ where: { userId: { in: users } } });
  await prisma.quizAttempt.deleteMany({ where: { userId: { in: users } } });
  await prisma.enrollment.deleteMany({ where: { userId: { in: users } } });
  await prisma.course.deleteMany({ where: { id: { in: courses } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

/** A published course with two lessons, and whatever approval rule is asked for. */
async function makeCourse(instructorId: string, requiresAdminApproval: boolean) {
  const category = await prisma.category.findFirstOrThrow();
  const suffix = requiresAdminApproval ? "-approval" : "";

  const course = await prisma.course.create({
    data: {
      title: `Completion ${RUN}${suffix}`,
      slug: `completion-${RUN}${suffix}`,
      status: "PUBLISHED",
      instructorId,
      categoryId: category.id,
      priceMinor: 0,
      certificateEnabled: true,
      requiresAdminApproval,
      modules: {
        create: {
          title: "Module one",
          position: 0,
          lessons: {
            create: [
              { title: "Lesson one", type: "TEXT", position: 0, content: "One" },
              { title: "Lesson two", type: "TEXT", position: 1, content: "Two" },
            ],
          },
        },
      },
      // A course that certifies has to assess, so the fixture does too.
      quizzes: {
        create: {
          title: "Check",
          passingScore: 70,
          countsTowardCertificate: true,
          questions: {
            create: {
              type: "TRUE_FALSE",
              prompt: "Consent can be withdrawn.",
              options: [],
              correctAnswer: true,
              points: 10,
              position: 1,
            },
          },
        },
      },
    },
    select: {
      id: true,
      modules: { select: { lessons: { select: { id: true }, orderBy: { position: "asc" } } } },
      quizzes: { select: { id: true, questions: { select: { id: true } } } },
    },
  });

  courses.push(course.id);
  const quiz = course.quizzes[0]!;
  return {
    id: course.id,
    lessons: course.modules[0]!.lessons.map((lesson) => lesson.id),
    quizId: quiz.id,
    questionId: quiz.questions[0]!.id,
  };
}

async function main() {
  const teacher = await prisma.user.create({
    data: { email: `comp-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Comp", lastName: "Teacher" } } },
  });
  users.push(teacher.id);

  const learner = await prisma.user.create({
    data: { email: `comp-learner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Ada", lastName: "Learner" } } },
  });
  users.push(learner.id);

  // --- a course that needs no approval --------------------------------------
  const open = await makeCourse(teacher.id, false);
  const enrolment = await prisma.enrollment.create({
    data: { userId: learner.id, courseId: open.id, status: "ACTIVE" },
    select: { id: true },
  });

  const first = await markLessonComplete(learner.id, open.lessons[0]!);
  check("completing one of two lessons does not finish the course",
    first.ok && first.finished === false && first.progressPercent === 50,
    first.ok ? `${first.progressPercent}%` : "failed");
  check("no certificate is issued part-way through",
    first.ok && first.certificate === null, "none");

  const second = await markLessonComplete(learner.id, open.lessons[1]!);
  check("completing the last lesson finishes the course",
    second.ok && second.finished === true && second.progressPercent === 100,
    second.ok ? `${second.progressPercent}%` : "failed");

  const after = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrolment.id } });
  check("the enrolment is marked completed", after.status === "COMPLETED", after.status);
  check("completion is timestamped", after.completedAt !== null, `${after.completedAt !== null}`);

  check("finishing the lessons does not issue a certificate on its own",
    second.ok && second.certificate === null,
    second.ok && second.certificate ? "issued!" : "withheld");
  check("and the learner is pointed at the assessment",
    second.ok && second.nextQuizId === open.quizId,
    second.ok ? String(second.nextQuizId) : "failed");

  // Passing is what earns it.
  const pass = await gradeAttempt(prisma, open.quizId, learner.id, [
    { questionId: open.questionId, response: true },
  ]);
  check("the passing attempt is graded as a pass",
    pass.ok && pass.result.passed === true,
    pass.ok ? `${pass.result.percentage}%` : "failed");
  check("a certificate is issued on passing",
    pass.ok && Boolean(pass.result.certificate),
    pass.ok && pass.result.certificate ? pass.result.certificate.credentialId : "none");

  const certificate = await prisma.certificate.findFirst({ where: { enrollmentId: enrolment.id } });
  check("the certificate exists on the enrolment", certificate !== null,
    certificate?.certificateNumber ?? "none");
  check("it carries a credential id anyone can verify",
    (certificate?.credentialId?.length ?? 0) > 8, certificate?.credentialId ?? "");
  check("its verification URL points at the configured domain",
    (certificate?.verificationUrl ?? "").includes("/verify/"), certificate?.verificationUrl ?? "");

  // --- completing again must not issue a second one --------------------------
  const repeat = await markLessonComplete(learner.id, open.lessons[1]!);
  check("re-completing a lesson does not issue a second certificate",
    repeat.ok && repeat.certificate === null, "none");
  check("and no assessment is left outstanding",
    repeat.ok && repeat.nextQuizId === null,
    repeat.ok ? String(repeat.nextQuizId) : "failed");

  const count = await prisma.certificate.count({ where: { enrollmentId: enrolment.id } });
  check("exactly one certificate exists for the enrolment", count === 1, `${count}`);

  // --- a course that asks for approval ---------------------------------------
  const gated = await makeCourse(teacher.id, true);
  const gatedEnrolment = await prisma.enrollment.create({
    data: { userId: learner.id, courseId: gated.id, status: "ACTIVE" },
    select: { id: true },
  });

  await markLessonComplete(learner.id, gated.lessons[0]!);
  const gatedFinish = await markLessonComplete(learner.id, gated.lessons[1]!);
  const gatedPass = await gradeAttempt(prisma, gated.quizId, learner.id, [
    { questionId: gated.questionId, response: true },
  ]);

  check("an approval-gated course still completes",
    gatedFinish.ok && gatedFinish.finished === true, "finished");
  check("its assessment can still be passed",
    gatedPass.ok && gatedPass.result.passed === true, "passed");
  check("but no certificate is issued without the approval",
    gatedPass.ok && !gatedPass.result.certificate, "withheld");

  const gatedEligibility = await evaluateEligibility(gatedEnrolment.id);
  check("it is reported as awaiting approval rather than as ineligible",
    gatedEligibility?.awaitingApproval === true && gatedEligibility.eligible === false,
    `awaiting=${gatedEligibility?.awaitingApproval}`);

  const gatedCount = await prisma.certificate.count({ where: { enrollmentId: gatedEnrolment.id } });
  check("nothing was issued behind the approval", gatedCount === 0, `${gatedCount}`);

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
