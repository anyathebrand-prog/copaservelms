/**
 * Functional checks for assignment submission and grading (PRD §9.6, §10.4).
 *
 * Runs against live Supabase Storage: files are really uploaded, really signed,
 * really fetched back, and really removed. The validation rules matter most
 * here — the client-side `accept` attribute is a convenience, and everything it
 * suggests has to be enforced again on the server.
 *
 *   npx tsx scripts/verify-assignments.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  getAssignmentForStudent,
  getGradingQueue,
  gradeSubmission,
  removeSubmissionFile,
  saveSubmission,
  SUBMISSION_BUCKET,
} from "../lib/assignments";
import { getStorage } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  const storage = getStorage(SUBMISSION_BUCKET);
  const submissions = await prisma.submission.findMany({
    where: { userId: { in: createdUsers } },
    select: { files: true },
  });
  for (const submission of submissions) {
    for (const file of (submission.files ?? []) as { key: string }[]) {
      await storage.remove(file.key).catch(() => {});
    }
  }
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

function fakeFile(name: string, sizeBytes: number) {
  return { name, bytes: new Uint8Array(sizeBytes).fill(65), mimeType: "application/octet-stream" };
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: {
      email: `asg-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Folake", lastName: "Ade" } },
    },
  });
  createdUsers.push(teacher.id);

  const student = await prisma.user.create({
    data: {
      email: `asg-student-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Bisi", lastName: "Lawal" } },
    },
  });
  createdUsers.push(student.id);

  const outsider = await prisma.user.create({
    data: {
      email: `asg-outsider-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Not", lastName: "Enrolled" } },
    },
  });
  createdUsers.push(outsider.id);

  const course = await prisma.course.create({
    data: {
      title: `Assignment Course ${RUN}`, slug: `assignment-course-${RUN}`,
      status: "PUBLISHED", instructorId: teacher.id, categoryId: category.id,
      assignments: { create: [{
        title: "Breach notification draft",
        instructions: "Write a notification.",
        maxPoints: 100,
        allowedFileTypes: ["pdf", "docx"],
        maxFileSizeMb: 1,
        allowResubmission: false,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }] },
    },
    select: { id: true, assignments: { select: { id: true } } },
  });
  createdCourses.push(course.id);
  const assignmentId = course.assignments[0].id;

  await prisma.enrollment.create({
    data: { userId: student.id, courseId: course.id, status: "ACTIVE" },
  });

  // --- access -------------------------------------------------------------
  const outsiderView = await getAssignmentForStudent(assignmentId, outsider.id);
  check("non-enrolled user cannot open the assignment", outsiderView === null,
    outsiderView === null ? "null" : "leaked");

  const view = await getAssignmentForStudent(assignmentId, student.id);
  check("enrolled student sees the assignment", view !== null, view?.assignment.title ?? "null");
  check("accepted types come from the assignment, not the default",
    view?.allowedTypes.join(",") === "pdf,docx", view?.allowedTypes.join(",") ?? "");

  // --- validation ---------------------------------------------------------
  const badType = await saveSubmission(assignmentId, student.id, {
    uploads: [fakeFile("notes.exe", 1024)], submit: false,
  });
  check("rejects a disallowed file type", !badType.ok && badType.error === "BAD_TYPE",
    badType.ok ? "accepted!" : `${badType.error} ${badType.detail ?? ""}`);

  const tooBig = await saveSubmission(assignmentId, student.id, {
    uploads: [fakeFile("huge.pdf", 2 * 1024 * 1024)], submit: false,
  });
  check("rejects a file over the assignment's limit", !tooBig.ok && tooBig.error === "TOO_LARGE",
    tooBig.ok ? "accepted!" : `${tooBig.error}`);

  // A rejected upload must not have written anything.
  const afterRejects = await getAssignmentForStudent(assignmentId, student.id);
  check("rejected uploads leave no files behind", (afterRejects?.files.length ?? 0) === 0,
    `${afterRejects?.files.length} file(s)`);

  const empty = await saveSubmission(assignmentId, student.id, { uploads: [], submit: true });
  check("refuses to submit nothing", !empty.ok && empty.error === "EMPTY",
    empty.ok ? "submitted!" : `${empty.error}`);

  const outsiderUpload = await saveSubmission(assignmentId, outsider.id, {
    uploads: [fakeFile("sneaky.pdf", 512)], submit: true,
  });
  check("non-enrolled user cannot submit", !outsiderUpload.ok,
    outsiderUpload.ok ? "submitted!" : `${outsiderUpload.error}`);

  // --- draft --------------------------------------------------------------
  const draft = await saveSubmission(assignmentId, student.id, {
    notes: "First pass.", uploads: [fakeFile("draft.pdf", 4096)], submit: false,
  });
  check("saves a draft", draft.ok && draft.data.status === "DRAFT",
    draft.ok ? draft.data.status : `${draft.error}`);

  const withDraft = await getAssignmentForStudent(assignmentId, student.id);
  check("draft file is stored and signed",
    withDraft?.files.length === 1 && Boolean(withDraft.files[0].url), `${withDraft?.files.length} file(s)`);

  // The signed URL must actually serve the bytes.
  const signedUrl = withDraft!.files[0].url!;
  const fetched = await fetch(signedUrl);
  const body = new Uint8Array(await fetched.arrayBuffer());
  check("signed URL serves the uploaded file", fetched.ok && body.byteLength === 4096,
    `${fetched.status}, ${body.byteLength} bytes`);

  // --- remove -------------------------------------------------------------
  const removed = await removeSubmissionFile(withDraft!.submission!.id, student.id, withDraft!.files[0].key);
  check("student can remove a file from a draft", removed.ok && removed.data.remaining === 0,
    removed.ok ? `${removed.data.remaining} remaining` : `${removed.error}`);

  const gone = await fetch(signedUrl);
  check("removed file is gone from storage", !gone.ok || gone.status === 400, `${gone.status}`);

  // --- submit -------------------------------------------------------------
  const submitted = await saveSubmission(assignmentId, student.id, {
    notes: "Final answer.", uploads: [fakeFile("final.pdf", 2048)], submit: true,
  });
  check("submits the work", submitted.ok && submitted.data.status === "SUBMITTED",
    submitted.ok ? submitted.data.status : `${submitted.error}`);

  // --- grading ------------------------------------------------------------
  const queue = await getGradingQueue(teacher.id, ["INSTRUCTOR"]);
  check("submission reaches the instructor's grading queue",
    queue.some((s) => s.assignment.id === assignmentId), `${queue.length} in queue`);

  const otherTeacherQueue = await getGradingQueue(outsider.id, ["INSTRUCTOR"]);
  check("another instructor does not see it",
    !otherTeacherQueue.some((s) => s.assignment.id === assignmentId), `${otherTeacherQueue.length} in queue`);

  const submissionId = queue.find((s) => s.assignment.id === assignmentId)!.id;

  const notMine = await gradeSubmission(submissionId, outsider.id, ["INSTRUCTOR"], { grade: 100 });
  check("another instructor cannot grade it", !notMine.ok && notMine.error === "NOT_FOUND",
    notMine.ok ? "graded!" : `${notMine.error}`);

  const overMax = await gradeSubmission(submissionId, teacher.id, ["INSTRUCTOR"], { grade: 150 });
  check("refuses a grade above the maximum", !overMax.ok, overMax.ok ? "accepted!" : `${overMax.error}`);

  const graded = await gradeSubmission(submissionId, teacher.id, ["INSTRUCTOR"], {
    grade: 82, feedback: "Clear and well structured.",
  });
  check("instructor grades the submission", graded.ok && graded.data.grade === 82,
    graded.ok ? `${graded.data.grade}` : `${graded.error}`);

  const afterGrading = await getAssignmentForStudent(assignmentId, student.id);
  check("student sees the grade and feedback",
    afterGrading?.submission?.grade === 82 && afterGrading.submission.feedback?.includes("structured") === true,
    `${afterGrading?.submission?.grade}`);

  // This assignment disallows resubmission, so graded work is final.
  const afterGradedEdit = await saveSubmission(assignmentId, student.id, {
    uploads: [fakeFile("sneaky-edit.pdf", 512)], submit: true,
  });
  check("graded work cannot be edited when resubmission is off",
    !afterGradedEdit.ok && afterGradedEdit.error === "ALREADY_GRADED",
    afterGradedEdit.ok ? "edited!" : `${afterGradedEdit.error}`);

  const cleared = await getGradingQueue(teacher.id, ["INSTRUCTOR"]);
  check("graded work leaves the queue",
    !cleared.some((s) => s.id === submissionId), `${cleared.length} remaining`);

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
