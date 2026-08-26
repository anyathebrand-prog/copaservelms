/**
 * Functional checks for the certificate-verification and quiz-delivery paths.
 *
 * These cover the logic that RLS deliberately cannot: both surfaces are served
 * by privileged server routes, so their authorisation rules live in code and
 * need testing here rather than in the database.
 *
 * Point LOCAL at a migrated, seeded database and run:
 *   LOCAL=postgres://... npm run verify:data-layer
 * Safe to re-run — every fixture is namespaced with a per-run suffix.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { verifyCredential } from "../lib/certificates";
import { getQuizForStudent, gradeAttempt } from "../lib/quizzes";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.LOCAL }) });

// Unique per run so the script can be re-run against the same database.
const RUN = Math.random().toString(36).slice(2, 8);

const results: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main() {
  // --- fixtures -----------------------------------------------------------
  const category = await prisma.category.findFirstOrThrow();
  const template = await prisma.certificateTemplate.findFirstOrThrow();

  const instructor = await prisma.user.create({
    data: {
      email: `tunde-${RUN}@bit.example`, status: "ACTIVE",
      profile: { create: { firstName: "Tunde", lastName: "Bakare" } },
    },
  });
  const student = await prisma.user.create({
    data: {
      email: `chidi-${RUN}@example.com`, status: "ACTIVE",
      profile: { create: { firstName: "Chidi", lastName: "Nwosu" } },
    },
  });
  const outsider = await prisma.user.create({
    data: {
      email: `mallory-${RUN}@example.com`, status: "ACTIVE",
      profile: { create: { firstName: "Mallory", lastName: "Eze" } },
    },
  });

  const course = await prisma.course.create({
    data: {
      title: "NDPA Foundations", slug: `ndpa-foundations-${RUN}`, status: "PUBLISHED",
      instructorId: instructor.id, categoryId: category.id, templateId: template.id,
    },
  });
  const enrollment = await prisma.enrollment.create({
    data: { userId: student.id, courseId: course.id, status: "ACTIVE" },
  });

  const quiz = await prisma.quiz.create({
    data: {
      courseId: course.id, title: "Module 1 Check", passingScore: 70, maxAttempts: 2,
      questions: {
        create: [
          { type: "MULTIPLE_CHOICE", position: 1, points: 2, prompt: "Which law governs data protection in Nigeria?",
            options: ["NDPA 2023", "GDPR", "HIPAA"], correctAnswer: "NDPA 2023", explanation: "Answer key — must never leave the server." },
          { type: "TRUE_FALSE", position: 2, points: 1, prompt: "A DPO must be independent.", correctAnswer: true },
          { type: "CHECKBOX", position: 3, points: 3, prompt: "Select the lawful bases.",
            options: ["Consent", "Contract", "Vibes"], correctAnswer: ["Consent", "Contract"] },
          { type: "ESSAY", position: 4, points: 4, prompt: "Explain data minimisation." },
        ],
      },
    },
  });

  const certificate = await prisma.certificate.create({
    data: {
      certificateNumber: `CERT-2026-${RUN}`, credentialId: `cred-${RUN}`,
      userId: student.id, enrollmentId: enrollment.id, templateId: template.id,
      status: "ISSUED", issuedAt: new Date("2026-06-01"), pdfUrl: "https://example.com/c.pdf",
      mintStatus: "MINT_ELIGIBLE",
    },
  });

  // --- verification -------------------------------------------------------
  const v = await verifyCredential(prisma, `cred-${RUN}`);
  check("verify: valid certificate resolves", v.found && v.valid && v.studentName === "Chidi Nwosu" && v.courseName === "NDPA Foundations",
    v.found ? `${v.studentName} / ${v.courseName} / valid=${v.valid}` : "not found");

  const byNumber = await verifyCredential(prisma, `CERT-2026-${RUN}`);
  check("verify: certificate number also resolves", byNumber.found && byNumber.valid, byNumber.found ? "resolved" : "not found");

  const missing = await verifyCredential(prisma, "does-not-exist");
  check("verify: unknown id returns not-found", !missing.found, `found=${missing.found}`);

  const probe = await verifyCredential(prisma, "x".repeat(200));
  check("verify: oversized id rejected", !probe.found, `found=${probe.found}`);

  // Revocation must be reflected on the very next read (PRD §11.4).
  await prisma.certificate.update({
    where: { id: certificate.id },
    data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Academic misconduct" },
  });
  const revoked = await verifyCredential(prisma, `cred-${RUN}`);
  check("verify: revocation is immediate", revoked.found && !revoked.valid && revoked.status === "REVOKED" && revoked.pdfUrl === null,
    revoked.found ? `status=${revoked.status} pdf=${revoked.pdfUrl}` : "not found");

  // Expiry is evaluated at read time, not stored.
  await prisma.certificate.update({
    where: { id: certificate.id },
    data: { status: "ISSUED", revokedAt: null, revocationReason: null, expiresAt: new Date("2026-01-01") },
  });
  const expired = await verifyCredential(prisma, `cred-${RUN}`);
  check("verify: lapsed certificate reads as expired", expired.found && !expired.valid && expired.status === "EXPIRED",
    expired.found ? `status=${expired.status}` : "not found");

  // --- quiz delivery ------------------------------------------------------
  const delivered = await getQuizForStudent(prisma, quiz.id, student.id);
  const serialised = JSON.stringify(delivered);
  // The option text "NDPA 2023" is *meant* to be visible — it is a choice the
  // student picks from. What must never appear is the key itself: the
  // correctAnswer/explanation fields, or the unrendered TRUE_FALSE answer.
  const keyFields = delivered.ok
    ? delivered.quiz.questions.flatMap((q) => Object.keys(q)).filter((k) => k === "correctAnswer" || k === "explanation")
    : [];
  const leaks = keyFields.length > 0 || serialised.includes("must never leave");
  check("quiz: answer key never delivered", delivered.ok && !leaks,
    leaks ? `LEAKED: ${keyFields.join(",") || "explanation text"}` : `delivered fields: ${delivered.ok ? Object.keys(delivered.quiz.questions[0]).join(",") : "n/a"}`);
  check("quiz: all questions delivered", delivered.ok && delivered.quiz.questions.length === 4,
    delivered.ok ? `${delivered.quiz.questions.length} questions` : `error=${delivered.error}`);

  const denied = await getQuizForStudent(prisma, quiz.id, outsider.id);
  check("quiz: unenrolled user denied", !denied.ok && denied.error === "NOT_ENROLLED", denied.ok ? "delivered!" : `error=${denied.error}`);

  // --- grading ------------------------------------------------------------
  const graded = await gradeAttempt(prisma, quiz.id, student.id, [
    { questionId: delivered.ok ? delivered.quiz.questions.find((q) => q.position === 1)!.id : "", response: "ndpa 2023" },
    { questionId: delivered.ok ? delivered.quiz.questions.find((q) => q.position === 2)!.id : "", response: true },
    { questionId: delivered.ok ? delivered.quiz.questions.find((q) => q.position === 3)!.id : "", response: ["Contract", "Consent"] },
    { questionId: delivered.ok ? delivered.quiz.questions.find((q) => q.position === 4)!.id : "", response: "Collect only what you need." },
  ]);
  check("grade: objective answers scored, case/order insensitive", graded.ok && graded.result.score === 6 && graded.result.maxScore === 10,
    graded.ok ? `${graded.result.score}/${graded.result.maxScore}` : `error=${graded.error}`);
  check("grade: essay holds attempt for manual grading", graded.ok && graded.result.status === "PENDING_MANUAL_GRADING" && graded.result.passed === null,
    graded.ok ? `status=${graded.result.status} passed=${graded.result.passed}` : "n/a");

  const cheat = await gradeAttempt(prisma, quiz.id, outsider.id, []);
  check("grade: unenrolled user cannot submit", !cheat.ok && cheat.error === "NOT_ENROLLED", cheat.ok ? "accepted!" : `error=${cheat.error}`);

  // maxAttempts is 2; one used above, one here, third must be refused.
  await gradeAttempt(prisma, quiz.id, student.id, []);
  const overLimit = await gradeAttempt(prisma, quiz.id, student.id, []);
  check("grade: attempt limit enforced", !overLimit.ok && overLimit.error === "ATTEMPT_LIMIT_REACHED",
    overLimit.ok ? "accepted!" : `error=${overLimit.error}`);

  const afterLimit = await getQuizForStudent(prisma, quiz.id, student.id);
  check("quiz: delivery refused once attempts exhausted", !afterLimit.ok && afterLimit.error === "ATTEMPT_LIMIT_REACHED",
    afterLimit.ok ? "delivered!" : `error=${afterLimit.error}`);

  // A missing answer must count against the score, not be ignored.
  const blank = await prisma.quizAttempt.findFirst({ where: { quizId: quiz.id }, orderBy: { attemptNumber: "desc" }, include: { answers: true } });
  check("grade: omitted answers recorded as incorrect", blank !== null && blank.answers.length === 4 && blank.score === 0,
    blank ? `${blank.answers.length} answers, score=${blank.score}` : "no attempt");

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main();
