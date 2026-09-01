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
 *   npx tsx --env-file=.env scripts/verify-completion.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { markLessonComplete } from "../lib/student";
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
  await prisma.certificate.deleteMany({ where: { userId: { in: users } } });
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
    },
    select: { id: true, modules: { select: { lessons: { select: { id: true }, orderBy: { position: "asc" } } } } },
  });

  courses.push(course.id);
  return { id: course.id, lessons: course.modules[0]!.lessons.map((lesson) => lesson.id) };
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

  check("a certificate is issued automatically",
    second.ok && second.certificate !== null,
    second.ok && second.certificate ? second.certificate.credentialId : "none");

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

  check("an approval-gated course still completes",
    gatedFinish.ok && gatedFinish.finished === true, "finished");
  check("but no certificate is issued without the approval",
    gatedFinish.ok && gatedFinish.certificate === null, "withheld");

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
