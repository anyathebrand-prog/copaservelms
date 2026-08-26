/**
 * End-to-end journey against the live stack.
 *
 * Everything before this was verified in isolation. This is the first run that
 * exercises the pieces together, through real Supabase Auth: signup fires the
 * auth.users trigger, which is what creates the app User, Profile, and STUDENT
 * role — the link every portal depends on and that nothing had ever tested.
 *
 * Journey: sign up → instructor authors a course → admin publishes → student
 * enrols → completes lessons → passes a quiz → submits an assignment → admin
 * issues a certificate → public verification → revocation → verification flips.
 *
 * Cleanup removes every fixture, including the auth users, and runs on failure.
 *
 *   npx tsx scripts/verify-end-to-end.ts
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { addLesson, addModule, createCourse, setCourseStatus } from "../lib/instructor";
import { reviewCourse, setUserRole } from "../lib/admin";
import { getQuizForStudent, gradeAttempt } from "../lib/quizzes";
import { markLessonComplete, getDashboardSummary } from "../lib/student";
import { issueCertificate, revokeCertificate } from "../lib/certificates/issue";
import { verifyCredential } from "../lib/certificates";
import { getStorage } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const authUserIds: string[] = [];
const courseIds: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/** Create a real auth user, the way a signup would. */
async function signUp(email: string, meta: Record<string, string>) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Test-${RUN}-Passw0rd!`,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`signup failed for ${email}: ${error.message}`);
  authUserIds.push(data.user.id);
  return data.user;
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: `-${RUN}@` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  const certs = await prisma.certificate.findMany({
    where: { userId: { in: ids } },
    select: { id: true, userId: true, certificateNumber: true },
  });

  // Stored PDFs are not covered by row deletion; remove them explicitly.
  const storage = getStorage();
  for (const cert of certs) {
    await storage.remove(`${cert.userId}/${cert.certificateNumber}.pdf`).catch(() => {});
  }
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: [...ids, ...certs.map((c) => c.id), ...courseIds] } }] },
  });
  await prisma.certificate.deleteMany({ where: { userId: { in: ids } } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dataSubjectRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  // Auth users are deleted last: the delete trigger soft-deletes the app row,
  // so removing them first would leave a redacted row behind.
  for (const id of authUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function main() {
  // --- 1. Signup through real Supabase Auth ------------------------------
  const studentAuth = await signUp(`student-${RUN}@example.com`, { first_name: "Chinelo", last_name: "Adeyemi" });
  const teacherAuth = await signUp(`teacher-${RUN}@example.com`, { full_name: "Ibrahim Musa Bello" });
  const adminAuth = await signUp(`admin-${RUN}@example.com`, { first_name: "Ops", last_name: "Admin" });

  // The trigger runs inside the auth transaction; allow a moment for it.
  await new Promise((r) => setTimeout(r, 1500));

  const student = await prisma.user.findFirst({
    where: { supabaseUserId: studentAuth.id },
    select: { id: true, email: true, status: true, emailVerified: true, profile: true, roles: { select: { role: { select: { name: true } } } } },
  });

  check("auth signup creates the app user", student !== null, student ? student.email : "missing");
  check("trigger creates the profile from signup metadata",
    student?.profile?.firstName === "Chinelo" && student?.profile?.lastName === "Adeyemi",
    `${student?.profile?.firstName} ${student?.profile?.lastName}`);
  check("trigger assigns the STUDENT role",
    student?.roles.some((r) => r.role.name === "STUDENT") === true,
    student?.roles.map((r) => r.role.name).join(",") ?? "none");
  check("confirmed email is reflected", student?.emailVerified === true, `${student?.emailVerified}`);

  const teacher = await prisma.user.findFirstOrThrow({ where: { supabaseUserId: teacherAuth.id }, select: { id: true, profile: true } });
  check("OAuth-style single name is split correctly",
    teacher.profile?.firstName === "Ibrahim" && teacher.profile?.lastName === "Musa Bello",
    `${teacher.profile?.firstName} / ${teacher.profile?.lastName}`);

  const adminUser = await prisma.user.findFirstOrThrow({ where: { supabaseUserId: adminAuth.id }, select: { id: true } });

  // --- 2. Roles ----------------------------------------------------------
  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: (await prisma.role.findFirstOrThrow({ where: { name: "SUPER_ADMIN" } })).id },
  });
  const promoted = await setUserRole(adminUser.id, ["SUPER_ADMIN"], teacher.id, "INSTRUCTOR", true);
  check("admin approves the instructor", promoted.ok && promoted.data.roles.includes("INSTRUCTOR"),
    promoted.ok ? promoted.data.roles.join(",") : "failed");

  // --- 3. Authoring ------------------------------------------------------
  const created = await createCourse(teacher.id, { title: `Data Protection Practice ${RUN}` });
  if (!created.ok) throw new Error("course creation failed");
  courseIds.push(created.data.id);

  await prisma.course.update({
    where: { id: created.data.id },
    data: { certificateEnabled: true, minQuizScore: 70, requiresAdminApproval: true },
  });

  const mod = await addModule(created.data.id, teacher.id, ["INSTRUCTOR"], "Foundations");
  if (!mod.ok) throw new Error("module failed");
  for (const title of ["What the NDPA covers", "Lawful bases"]) {
    await addLesson(mod.data.id, teacher.id, ["INSTRUCTOR"], { title, type: "TEXT", content: "Body." });
  }

  const quiz = await prisma.quiz.create({
    data: {
      courseId: created.data.id, title: "Foundations check", passingScore: 70, countsTowardCertificate: true,
      questions: { create: [
        { type: "MULTIPLE_CHOICE", position: 1, points: 5, prompt: "Which law applies?", options: ["NDPA 2023", "GDPR"], correctAnswer: "NDPA 2023" },
        { type: "TRUE_FALSE", position: 2, points: 5, prompt: "A DPO must be independent.", correctAnswer: true },
      ] },
    },
    select: { id: true },
  });

  const submitted = await setCourseStatus(created.data.id, teacher.id, ["INSTRUCTOR"], "SUBMITTED");
  check("instructor submits the course for review", submitted.ok, submitted.ok ? submitted.data.status : "failed");

  const selfPublish = await setCourseStatus(created.data.id, teacher.id, ["INSTRUCTOR"], "PUBLISHED");
  check("instructor still cannot self-publish", !selfPublish.ok, selfPublish.ok ? "published!" : selfPublish.error);

  const published = await reviewCourse(adminUser.id, ["SUPER_ADMIN"], created.data.id, "PUBLISH");
  check("admin publishes the course", published.ok && published.data.status === "PUBLISHED",
    published.ok ? published.data.status : "failed");

  // --- 4. Learning -------------------------------------------------------
  const enrollment = await prisma.enrollment.create({
    data: { userId: student!.id, courseId: created.data.id, status: "ACTIVE", startedAt: new Date() },
    select: { id: true },
  });

  const delivered = await getQuizForStudent(prisma, quiz.id, student!.id);
  check("quiz delivers to the enrolled student", delivered.ok,
    delivered.ok ? `${delivered.quiz.questions.length} questions` : delivered.error);

  const leaked = JSON.stringify(delivered).includes("correctAnswer");
  check("delivered quiz carries no answer key", !leaked, leaked ? "LEAKED" : "clean");

  if (delivered.ok) {
    const graded = await gradeAttempt(prisma, quiz.id, student!.id, [
      { questionId: delivered.quiz.questions.find((q) => q.position === 1)!.id, response: "NDPA 2023" },
      { questionId: delivered.quiz.questions.find((q) => q.position === 2)!.id, response: true },
    ]);
    check("quiz grades server-side", graded.ok && graded.result.percentage === 100,
      graded.ok ? `${graded.result.percentage}%` : "failed");
  }

  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId: created.data.id } },
    select: { id: true },
  });
  for (const lesson of lessons) {
    await markLessonComplete(student!.id, lesson.id);
  }

  const summary = await getDashboardSummary(student!.id);
  check("dashboard shows the completed course", summary.completedCourses === 1 && summary.overallProgress === 100,
    `${summary.completedCourses} completed, ${summary.overallProgress}%`);

  // --- 5. Certificate ----------------------------------------------------
  const issued = await issueCertificate(enrollment.id, { actorId: adminUser.id, overrideApproval: true });
  check("admin issues the certificate", issued.ok,
    issued.ok ? issued.certificateNumber : `${issued.error}: ${issued.message}`);

  if (!issued.ok) throw new Error("issuance failed, cannot continue");

  // The PDF must actually exist in storage, not merely be referenced.
  const record = await prisma.certificate.findUniqueOrThrow({
    where: { id: issued.certificateId },
    select: { pdfUrl: true, userId: true, certificateNumber: true },
  });
  const signed = await getStorage().signedUrl(`${record.userId}/${record.certificateNumber}.pdf`, 60);
  const response = await fetch(signed);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");

  check("PDF is retrievable from storage", response.ok && header === "%PDF-",
    `${response.status}, ${header}, ${bytes.length} bytes`);

  // --- 6. Verification ---------------------------------------------------
  const verified = await verifyCredential(prisma, issued.credentialId);
  check("public verification resolves the credential",
    verified.found && verified.valid && verified.studentName === "Chinelo Adeyemi",
    verified.found ? `${verified.studentName}, valid=${verified.valid}` : "not found");

  const revoked = await revokeCertificate(issued.certificateId, adminUser.id, "End-to-end test revocation.");
  check("admin revokes the certificate", revoked.ok, revoked.ok ? "revoked" : "failed");

  const afterRevoke = await verifyCredential(prisma, issued.credentialId);
  check("verification reflects revocation immediately",
    afterRevoke.found && !afterRevoke.valid && afterRevoke.status === "REVOKED",
    afterRevoke.found ? afterRevoke.status : "not found");

  // --- 7. Auth deletion --------------------------------------------------
  await admin.auth.admin.deleteUser(teacherAuth.id);
  await new Promise((r) => setTimeout(r, 1000));
  const afterDelete = await prisma.user.findFirst({
    where: { email: `teacher-${RUN}@example.com` },
    select: { status: true, deletedAt: true, supabaseUserId: true },
  });
  check("deleting an auth user soft-deletes rather than cascading",
    afterDelete?.status === "DEACTIVATED" && afterDelete.deletedAt !== null && afterDelete.supabaseUserId === null,
    `${afterDelete?.status}, deletedAt=${afterDelete?.deletedAt !== null}`);

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
