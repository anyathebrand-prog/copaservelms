import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { sendNotification } from "@/lib/notifications";

/**
 * Assignment submission and grading (PRD §9.6, §10.4).
 *
 * Uploads land in a private `submissions` bucket and are only ever reached
 * through short-lived signed URLs minted for someone already authorised to see
 * them — the submitter, or the course's instructor. Nothing is public.
 */

export const SUBMISSION_BUCKET = process.env.SUPABASE_SUBMISSION_BUCKET ?? "submissions";

/** Upload types §9.6 lists, mapped to the extensions we accept. */
const DEFAULT_ALLOWED = ["pdf", "doc", "docx", "zip", "png", "jpg", "jpeg", "webp", "mp4", "mov"];

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export const DEFAULT_MAX_FILE_MB = 25;

export type SubmissionFile = {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export type SubmissionError =
  | "NOT_FOUND"
  | "NOT_ENROLLED"
  | "CLOSED"
  | "TOO_LARGE"
  | "BAD_TYPE"
  | "EMPTY"
  | "ALREADY_GRADED";

export type Result<T> = { ok: true; data: T } | { ok: false; error: SubmissionError; detail?: string };

/** The assignment plus this student's latest submission, or null if not enrolled. */
export async function getAssignmentForStudent(assignmentId: string, userId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      instructions: true,
      dueAt: true,
      maxPoints: true,
      allowedFileTypes: true,
      maxFileSizeMb: true,
      allowResubmission: true,
      rubric: true,
      isRequiredForCertificate: true,
      courseId: true,
      course: { select: { title: true, slug: true } },
    },
  });

  if (!assignment) return null;

  const enrollment = await prisma.enrollment.findFirst({
    where: { courseId: assignment.courseId, userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });

  // Same answer as a missing assignment: whether one exists inside a course you
  // cannot see is not information an outsider should get.
  if (!enrollment) return null;

  const submission = await prisma.submission.findFirst({
    where: { assignmentId, userId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true, status: true, files: true, notes: true, attemptNumber: true,
      submittedAt: true, grade: true, feedback: true, rubricScores: true, gradedAt: true,
    },
  });

  const files = (submission?.files ?? []) as SubmissionFile[];

  return {
    assignment,
    enrollmentId: enrollment.id,
    submission,
    // Evaluated here rather than during render: the deadline is a property of
    // the fetch, not something a component should recompute on each pass.
    pastDue: assignment.dueAt !== null && assignment.dueAt.getTime() < Date.now(),
    // Signed on read, never stored: a URL saved in the row would outlive its
    // expiry and become a dead link, or worse, a long-lived public one.
    files: await signFiles(files),
    allowedTypes: assignment.allowedFileTypes.length ? assignment.allowedFileTypes : DEFAULT_ALLOWED,
    maxFileMb: assignment.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB,
  };
}

async function signFiles(files: SubmissionFile[]) {
  const storage = getStorage(SUBMISSION_BUCKET);
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      // Short expiry: long enough to click, short enough that a copied link
      // stops working quickly.
      url: await storage.signedUrl(file.key, 60 * 10).catch(() => null),
    })),
  );
}

export type UploadInput = { name: string; bytes: Uint8Array; mimeType: string };

/**
 * Save or submit work.
 *
 * A draft can be revised freely; submitting after the deadline is refused
 * unless the assignment allows resubmission and the work is not yet graded.
 * Grades are never touched here — see gradeSubmission.
 */
export async function saveSubmission(
  assignmentId: string,
  userId: string,
  input: { notes?: string | null; uploads: UploadInput[]; submit: boolean },
): Promise<Result<{ submissionId: string; status: string }>> {
  const context = await getAssignmentForStudent(assignmentId, userId);
  if (!context) return { ok: false, error: "NOT_FOUND" };

  const { assignment, enrollmentId, submission } = context;

  if (submission?.status === "GRADED" && !assignment.allowResubmission) {
    return { ok: false, error: "ALREADY_GRADED" };
  }

  const pastDue = assignment.dueAt !== null && assignment.dueAt.getTime() < Date.now();
  if (pastDue && input.submit && !assignment.allowResubmission) {
    return { ok: false, error: "CLOSED" };
  }

  const existingFiles = (submission?.files ?? []) as SubmissionFile[];

  // Validate everything before uploading anything, so a rejected second file
  // does not leave the first one orphaned in the bucket.
  for (const upload of input.uploads) {
    const extension = upload.name.split(".").pop()?.toLowerCase() ?? "";
    if (!context.allowedTypes.includes(extension)) {
      return { ok: false, error: "BAD_TYPE", detail: `${upload.name} (.${extension})` };
    }
    if (upload.bytes.byteLength > context.maxFileMb * 1024 * 1024) {
      return {
        ok: false,
        error: "TOO_LARGE",
        detail: `${upload.name} is ${Math.round(upload.bytes.byteLength / 1024 / 1024)}MB, limit ${context.maxFileMb}MB`,
      };
    }
  }

  if (input.submit && existingFiles.length === 0 && input.uploads.length === 0 && !input.notes?.trim()) {
    return { ok: false, error: "EMPTY" };
  }

  const storage = getStorage(SUBMISSION_BUCKET);
  const uploaded: SubmissionFile[] = [];

  for (const upload of input.uploads) {
    const extension = upload.name.split(".").pop()?.toLowerCase() ?? "bin";
    const safeName = upload.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const key = `${assignment.courseId}/${assignmentId}/${userId}/${Date.now()}-${safeName}`;

    await storage.upload(key, upload.bytes, MIME_BY_EXTENSION[extension] ?? "application/octet-stream");

    uploaded.push({
      key,
      name: upload.name,
      mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
      sizeBytes: upload.bytes.byteLength,
    });
  }

  const files = [...existingFiles, ...uploaded];
  const status = input.submit
    ? submission?.submittedAt
      ? "RESUBMITTED"
      : "SUBMITTED"
    : "DRAFT";

  // A resubmission is a new attempt; editing a draft is not.
  const isNewAttempt = input.submit && submission?.status === "GRADED";

  const saved = isNewAttempt
    ? await prisma.submission.create({
        data: {
          assignmentId, userId, enrollmentId,
          status: "RESUBMITTED",
          files: files as never,
          notes: input.notes?.trim() || null,
          attemptNumber: (submission?.attemptNumber ?? 0) + 1,
          submittedAt: new Date(),
        },
        select: { id: true, status: true },
      })
    : submission
      ? await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status,
            files: files as never,
            notes: input.notes?.trim() || null,
            submittedAt: input.submit ? new Date() : submission.submittedAt,
          },
          select: { id: true, status: true },
        })
      : await prisma.submission.create({
          data: {
            assignmentId, userId, enrollmentId,
            status,
            files: files as never,
            notes: input.notes?.trim() || null,
            attemptNumber: 1,
            submittedAt: input.submit ? new Date() : null,
          },
          select: { id: true, status: true },
        });

  return { ok: true, data: { submissionId: saved.id, status: saved.status } };
}

/** Remove one attached file from a draft. */
export async function removeSubmissionFile(
  submissionId: string,
  userId: string,
  key: string,
): Promise<Result<{ remaining: number }>> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, userId },
    select: { id: true, status: true, files: true },
  });

  if (!submission) return { ok: false, error: "NOT_FOUND" };
  if (submission.status === "GRADED") return { ok: false, error: "ALREADY_GRADED" };

  const files = (submission.files as SubmissionFile[]).filter((f) => f.key !== key);

  await getStorage(SUBMISSION_BUCKET).remove(key).catch(() => {});
  await prisma.submission.update({ where: { id: submissionId }, data: { files: files as never } });

  return { ok: true, data: { remaining: files.length } };
}

// ---------------------------------------------------------------------------
// Instructor grading (§10.4)
// ---------------------------------------------------------------------------

/** Submissions awaiting grading across an instructor's courses. */
export async function getGradingQueue(instructorId: string, roles: string[]) {
  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");

  const submissions = await prisma.submission.findMany({
    where: {
      status: { in: ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"] },
      assignment: isAdmin ? {} : { course: { instructorId } },
    },
    orderBy: { submittedAt: "asc" },
    take: 100,
    select: {
      id: true, status: true, notes: true, files: true, submittedAt: true, attemptNumber: true,
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      assignment: {
        select: { id: true, title: true, maxPoints: true, rubric: true, course: { select: { title: true } } },
      },
    },
  });

  return Promise.all(
    submissions.map(async (submission) => ({
      ...submission,
      files: await signFiles((submission.files ?? []) as SubmissionFile[]),
      studentName:
        `${submission.user.profile?.firstName ?? ""} ${submission.user.profile?.lastName ?? ""}`.trim() ||
        submission.user.email,
    })),
  );
}

/**
 * Grade a submission.
 *
 * Ownership is re-checked here rather than trusted from the queue: the queue is
 * a read, and a grade is a write that must stand on its own authorisation.
 */
export async function gradeSubmission(
  submissionId: string,
  graderId: string,
  roles: string[],
  input: { grade: number; feedback?: string | null; rubricScores?: unknown },
): Promise<Result<{ grade: number }>> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      assignment: { select: { maxPoints: true, course: { select: { instructorId: true } } } },
    },
  });

  if (!submission) return { ok: false, error: "NOT_FOUND" };

  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  if (!isAdmin && submission.assignment.course.instructorId !== graderId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (
    !Number.isFinite(input.grade) ||
    input.grade < 0 ||
    input.grade > submission.assignment.maxPoints
  ) {
    return {
      ok: false,
      error: "BAD_TYPE",
      detail: `grade must be between 0 and ${submission.assignment.maxPoints}`,
    };
  }

  const updated = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      grade: Math.round(input.grade),
      feedback: input.feedback?.trim() || null,
      rubricScores: (input.rubricScores ?? undefined) as never,
      status: "GRADED",
      gradedById: graderId,
      gradedAt: new Date(),
    },
    select: { userId: true, assignment: { select: { id: true, title: true, maxPoints: true } } },
  });

  await sendNotification({
    userId: updated.userId,
    kind: "assignment.graded",
    title: `${updated.assignment.title} has been graded`,
    body: `You scored ${Math.round(input.grade)}/${updated.assignment.maxPoints}.${
      input.feedback?.trim() ? ` Feedback: ${input.feedback.trim()}` : ""
    }`,
    actionUrl: `/student/assignments/${updated.assignment.id}`,
    channels: ["EMAIL"],
  }).catch(() => {});

  return { ok: true, data: { grade: Math.round(input.grade) } };
}
