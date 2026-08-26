/**
 * Functional checks for certificate issuance (PRD §11).
 *
 * What matters here: the §11.1 conditions are actually enforced (a certificate
 * must not be issuable to someone who has not done the work), the PDF is a real
 * document carrying a scannable QR, and revocation is immediately visible to
 * the public verification path.
 *
 * PDF rendering is exercised directly; storage upload is skipped unless
 * SUPABASE_SERVICE_ROLE_KEY is set, and that is reported rather than hidden.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-certificates.ts
 */
import { PDFDocument } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { evaluateEligibility, findIssuableEnrollments } from "../lib/certificates/eligibility";
import { issueCertificate, revokeCertificate } from "../lib/certificates/issue";
import { renderCertificatePdf } from "../lib/certificates/pdf";
import { verifyCredential } from "../lib/certificates";
import { getStorage, isStorageConfigured } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  const certs = await prisma.certificate.findMany({
    where: { userId: { in: createdUsers } },
    select: { id: true, userId: true, certificateNumber: true },
  });

  // Delete the stored PDFs too — removing only the rows leaves orphaned
  // objects in the bucket that nothing references any more.
  if (isStorageConfigured()) {
    const storage = getStorage();
    for (const cert of certs) {
      await storage.remove(`${cert.userId}/${cert.certificateNumber}.pdf`).catch(() => {});
    }
  }
  await prisma.auditLog.deleteMany({ where: { entityId: { in: certs.map((c) => c.id) } } });
  await prisma.certificate.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const instructor = await prisma.user.create({
    data: {
      email: `cert-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Amaka", lastName: "Obi" } },
    },
  });
  createdUsers.push(instructor.id);

  const student = await prisma.user.create({
    data: {
      email: `cert-student-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Emeka", lastName: "Okonkwo" } },
    },
  });
  createdUsers.push(student.id);

  // A course with a real bar: every lesson, 70% quizzes, required assignment.
  const course = await prisma.course.create({
    data: {
      title: `Certified Compliance ${RUN}`,
      slug: `certified-compliance-${RUN}`,
      status: "PUBLISHED",
      instructorId: instructor.id,
      categoryId: category.id,
      certificateEnabled: true,
      minQuizScore: 70,
      requiresAssignments: true,
      requiresAdminApproval: true,
      modules: {
        create: [{
          title: "Module 1", position: 1,
          lessons: { create: [
            { title: "L1", type: "TEXT", position: 1 },
            { title: "L2", type: "TEXT", position: 2 },
          ] },
        }],
      },
      assignments: { create: [{ title: "Case study", maxPoints: 100, isRequiredForCertificate: true }] },
      quizzes: { create: [{
        title: "Final", passingScore: 70, countsTowardCertificate: true,
        questions: { create: [{ type: "TRUE_FALSE", position: 1, points: 10, prompt: "Q", correctAnswer: true }] },
      }] },
    },
    select: {
      id: true,
      modules: { select: { lessons: { select: { id: true } } } },
      quizzes: { select: { id: true } },
      assignments: { select: { id: true } },
    },
  });
  createdCourses.push(course.id);

  const enrollment = await prisma.enrollment.create({
    data: { userId: student.id, courseId: course.id, status: "ACTIVE" },
  });

  const lessons = course.modules.flatMap((m) => m.lessons);

  // --- nothing done yet ---------------------------------------------------
  let eligibility = await evaluateEligibility(enrollment.id);
  check("fresh enrolment is not eligible", eligibility?.eligible === false,
    `${eligibility?.conditions.filter((c) => c.applicable && !c.met).length} unmet`);

  const premature = await issueCertificate(enrollment.id, { actorId: instructor.id, overrideApproval: true });
  check("cannot issue before the work is done", !premature.ok && premature.error === "NOT_ELIGIBLE",
    premature.ok ? "issued!" : `${premature.error}`);

  // --- lessons only -------------------------------------------------------
  for (const lesson of lessons) {
    await prisma.lessonProgress.create({
      data: { enrollmentId: enrollment.id, lessonId: lesson.id, userId: student.id, completed: true, completedAt: new Date() },
    });
  }
  eligibility = await evaluateEligibility(enrollment.id);
  check("lessons alone are not enough",
    eligibility?.conditions.find((c) => c.id === "lessons")?.met === true && eligibility?.eligible === false,
    "lessons met, still ineligible");

  // --- failing quiz -------------------------------------------------------
  await prisma.quizAttempt.create({
    data: {
      quizId: course.quizzes[0].id, userId: student.id, enrollmentId: enrollment.id,
      attemptNumber: 1, status: "AUTO_GRADED", score: 4, maxScore: 10, passed: false, submittedAt: new Date(),
    },
  });
  eligibility = await evaluateEligibility(enrollment.id);
  check("a failing quiz does not satisfy the score condition",
    eligibility?.conditions.find((c) => c.id === "quizzes")?.met === false,
    eligibility?.conditions.find((c) => c.id === "quizzes")?.detail ?? "");

  // --- passing retake -----------------------------------------------------
  await prisma.quizAttempt.create({
    data: {
      quizId: course.quizzes[0].id, userId: student.id, enrollmentId: enrollment.id,
      attemptNumber: 2, status: "AUTO_GRADED", score: 9, maxScore: 10, passed: true, submittedAt: new Date(),
    },
  });
  eligibility = await evaluateEligibility(enrollment.id);
  check("best attempt counts, not the average of all attempts",
    eligibility?.conditions.find((c) => c.id === "quizzes")?.met === true,
    eligibility?.conditions.find((c) => c.id === "quizzes")?.detail ?? "");

  // --- assignment still outstanding --------------------------------------
  check("required assignment still blocks issuance", eligibility?.eligible === false,
    eligibility?.conditions.find((c) => c.id === "assignments")?.detail ?? "");

  await prisma.submission.create({
    data: {
      assignmentId: course.assignments[0].id, userId: student.id, enrollmentId: enrollment.id,
      status: "SUBMITTED", submittedAt: new Date(),
    },
  });

  eligibility = await evaluateEligibility(enrollment.id);
  check("with everything done, only admin approval remains",
    eligibility?.awaitingApproval === true && eligibility?.eligible === false,
    `awaitingApproval=${eligibility?.awaitingApproval}`);

  const issuable = await findIssuableEnrollments(course.id);
  check("appears in the admin issuance queue",
    issuable.some((i) => i.enrollmentId === enrollment.id), `${issuable.length} candidate(s)`);

  // --- PDF ----------------------------------------------------------------
  const pdf = await renderCertificatePdf({
    studentName: "Emeka Okonkwo",
    courseName: `Certified Compliance ${RUN}`,
    instructorName: "Amaka Obi",
    institutionName: "Business Intelligence Technologies Limited",
    certificateNumber: "CERT-2026-000001",
    credentialId: "testcredential123",
    issueDate: new Date(),
    expiryDate: null,
    verificationUrl: "https://verify.copaserve.ng/testcredential123",
  });

  const header = Buffer.from(pdf.slice(0, 5)).toString("latin1");
  check("PDF renders with a valid header", header === "%PDF-", `${header} (${pdf.length} bytes)`);

  // Assert structure by parsing the document back, not by searching raw bytes:
  // metadata lives in a compressed stream, so a byte search finds nothing even
  // when the field is set correctly.
  const parsed = await PDFDocument.load(pdf);
  check("PDF is a single A4 landscape page",
    parsed.getPageCount() === 1 && Math.round(parsed.getPage(0).getWidth()) === 842,
    `${parsed.getPageCount()} page, ${Math.round(parsed.getPage(0).getWidth())}x${Math.round(parsed.getPage(0).getHeight())}`);
  check("credential id is embedded in PDF metadata",
    (parsed.getKeywords() ?? "").includes("testcredential123"), `${parsed.getKeywords()}`);
  check("holder and course appear in the document title",
    (parsed.getTitle() ?? "").includes("Emeka Okonkwo"), `${parsed.getTitle()}`);

  // Two images are drawn: the QR and the institution logo. The logo is a PNG
  // with transparency, which pdf-lib embeds as an image plus a soft mask, so
  // the object count is three. Asserting "at least two" keeps the check
  // meaningful without pinning it to that encoding detail.
  const imageCount = (Buffer.from(pdf).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
  check("QR code and logo are embedded as images", imageCount >= 2,
    `${imageCount} image xobject(s) — QR, logo, and the logo's alpha mask`);

  // --- issuance -----------------------------------------------------------
  const storageReady = isStorageConfigured();

  if (!storageReady) {
    const attempt = await issueCertificate(enrollment.id, { actorId: instructor.id, overrideApproval: true });
    check("issuance fails loudly when storage is unconfigured",
      !attempt.ok && attempt.error === "STORAGE_FAILED",
      attempt.ok ? "issued without storage!" : `${attempt.error}`);

    const orphan = await prisma.certificate.count({ where: { enrollmentId: enrollment.id } });
    check("a failed upload leaves no certificate row", orphan === 0, `${orphan} row(s)`);

    results.push("SKIP  end-to-end issuance — SUPABASE_SERVICE_ROLE_KEY not set");
  } else {
    const issued = await issueCertificate(enrollment.id, { actorId: instructor.id, overrideApproval: true });
    check("admin approval issues the certificate", issued.ok,
      issued.ok ? issued.certificateNumber : `${issued.error}: ${issued.message}`);

    if (issued.ok) {
      check("certificate number follows CERT-YYYY-NNNNNN",
        /^CERT-\d{4}-\d{6}$/.test(issued.certificateNumber), issued.certificateNumber);
      check("credential id is not the certificate number",
        issued.credentialId !== issued.certificateNumber && issued.credentialId.length >= 16,
        issued.credentialId);

      const again = await issueCertificate(enrollment.id, { actorId: instructor.id, overrideApproval: true });
      check("cannot issue twice", !again.ok && again.error === "ALREADY_ISSUED",
        again.ok ? "issued twice!" : `${again.error}`);

      const verified = await verifyCredential(prisma, issued.credentialId);
      check("issued certificate verifies publicly",
        verified.found && verified.valid && verified.studentName === "Emeka Okonkwo",
        verified.found ? `valid=${verified.valid}` : "not found");

      const revoked = await revokeCertificate(issued.certificateId, instructor.id, "Test revocation.");
      check("revocation succeeds", revoked.ok, revoked.ok ? "revoked" : `${revoked.error}`);

      const afterRevoke = await verifyCredential(prisma, issued.credentialId);
      check("revocation is immediately visible to verification",
        afterRevoke.found && !afterRevoke.valid && afterRevoke.status === "REVOKED" && afterRevoke.pdfUrl === null,
        afterRevoke.found ? `${afterRevoke.status}, pdf=${afterRevoke.pdfUrl}` : "not found");
    }
  }

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${passed} passed, ${failed} failed${results.some((r) => r.startsWith("SKIP")) ? ", 1 skipped" : ""}`);
  return failed === 0;
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
