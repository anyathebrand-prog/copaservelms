"use server";

import { resolveCategoryFromForm } from "@/lib/categories";
import { revalidatePath } from "next/cache";
import { clearCourseBanner, setCourseBanner } from "@/lib/course-media";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  addLesson,
  addModule,
  attachLessonUpload,
  createCourse,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  prepareLessonUpload,
  removeLessonUpload,
  setCourseStatus,
  updateCourseDetails,
  updateLesson,
  type MutationError,
  type UploadError,
} from "@/lib/instructor";
import type { CourseLevel, CourseStatus, LessonType } from "@/app/generated/prisma/enums";

/**
 * Server Actions for the course builder.
 *
 * Server Actions are public endpoints: the actor is always re-derived from the
 * session here, never read from the form. Ownership itself is checked inside
 * lib/instructor.ts, so no action can reach a course by id alone.
 */

async function requireInstructor() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const permitted =
    user.roles.includes("INSTRUCTOR") ||
    user.roles.includes("ADMIN") ||
    user.roles.includes("SUPER_ADMIN");

  if (!permitted) throw new Error("Instructor access required.");

  return user;
}

/** Surface the failure rather than letting a form silently appear to succeed. */
function explode(error: MutationError): never {
  const messages: Record<MutationError, string> = {
    NOT_FOUND: "That course no longer exists.",
    FORBIDDEN: "You cannot make that change.",
    INVALID: "That input is not valid.",
    LOCKED: "Withdraw the course to draft before editing its curriculum.",
  };
  throw new Error(messages[error]);
}

export async function createCourseAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();

  const category = await resolveCategoryFromForm(
    (formData.get("categoryId") as string) || null,
    (formData.get("newCategory") as string) || null,
    user.id,
  );
  if (!category.ok) throw new Error(category.detail);

  const result = await createCourse(user.id, {
    title: String(formData.get("title") ?? ""),
    categoryId: category.data.id,
    level: (formData.get("level") as CourseLevel) || "BEGINNER",
  });

  if (!result.ok) explode(result.error);

  revalidatePath("/instructor");
  redirect(`/instructor/courses/${result.data.id}`);
}

export async function updateCourseAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const courseId = String(formData.get("courseId") ?? "");

  const priceRaw = String(formData.get("priceMajor") ?? "").trim();
  const minutesRaw = String(formData.get("estimatedMinutes") ?? "").trim();
  const minQuizRaw = String(formData.get("minQuizScore") ?? "").trim();

  const category = await resolveCategoryFromForm(
    (formData.get("categoryId") as string) || null,
    (formData.get("newCategory") as string) || null,
    user.id,
  );
  if (!category.ok) throw new Error(category.detail);

  const result = await updateCourseDetails(courseId, user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    subtitle: (formData.get("subtitle") as string) || null,
    description: (formData.get("description") as string) || null,
    level: (formData.get("level") as CourseLevel) || undefined,
    // The form collects naira; the column stores kobo.
    priceMinor: priceRaw === "" ? undefined : Math.round(Number(priceRaw) * 100),
    estimatedMinutes: minutesRaw === "" ? null : Number(minutesRaw),
    categoryId: category.data.id,
    minQuizScore: minQuizRaw === "" ? null : Number(minQuizRaw),
    requiresAssignments: formData.get("requiresAssignments") === "on",
    certificateEnabled: formData.get("certificateEnabled") === "on",
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/instructor/courses/${courseId}`);
}

/**
 * Replace or remove a course banner.
 *
 * The file arrives in the form; the course id does too, so ownership is
 * re-checked server-side inside setCourseBanner rather than trusted from the
 * request. Revalidates the public catalogue as well as the editor, because the
 * banner is the one course field a visitor sees before they click anything.
 */
export async function courseBannerAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const courseId = String(formData.get("courseId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const remove = formData.get("intent") === "remove";
  const file = formData.get("banner");

  const result = remove
    ? await clearCourseBanner(courseId, user.id, user.roles)
    : file instanceof File && file.size > 0
      ? await setCourseBanner(courseId, file, user.id, user.roles)
      : { ok: false as const, error: "INVALID" as const, detail: "Choose an image first." };

  if (!result.ok) {
    // The detail is the useful half — "Keep the image under 4MB" tells the
    // instructor what to do, where "That input is not valid" does not.
    throw new Error(
      result.detail ??
        (result.error === "FORBIDDEN"
          ? "You cannot change that course."
          : result.error === "NOT_FOUND"
            ? "That course no longer exists."
            : "That image could not be used."),
    );
  }

  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath("/courses");
  if (slug) revalidatePath(`/courses/${slug}`);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const courseId = String(formData.get("courseId") ?? "");
  const status = String(formData.get("status") ?? "") as CourseStatus;

  const result = await setCourseStatus(courseId, user.id, user.roles, status);
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath("/instructor");
}

export async function addModuleAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const courseId = String(formData.get("courseId") ?? "");

  const result = await addModule(courseId, user.id, user.roles, String(formData.get("title") ?? ""));
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function deleteModuleAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const result = await deleteModule(String(formData.get("moduleId") ?? ""), user.id, user.roles);
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}

export async function moveModuleAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const result = await moveModule(
    String(formData.get("moduleId") ?? ""),
    user.id,
    user.roles,
    formData.get("direction") === "up" ? "up" : "down",
  );
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}

export async function addLessonAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();

  const result = await addLesson(String(formData.get("moduleId") ?? ""), user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    type: (formData.get("type") as LessonType) || "TEXT",
    contentUrl: (formData.get("contentUrl") as string) || null,
    content: (formData.get("content") as string) || null,
    durationSeconds: durationRaw === "" ? null : Math.round(Number(durationRaw) * 60),
    isPreview: formData.get("isPreview") === "on",
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}

export async function updateLessonAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();

  const result = await updateLesson(String(formData.get("lessonId") ?? ""), user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    type: (formData.get("type") as LessonType) || undefined,
    // Absent is not the same as empty. A lesson with an uploaded file has no
    // link field in the form at all, and reading that as "cleared" would
    // delete the upload every time the instructor fixed a typo in the title.
    contentUrl: formData.has("contentUrl") ? (formData.get("contentUrl") as string) || null : undefined,
    content: (formData.get("content") as string) || null,
    durationSeconds: durationRaw === "" ? null : Math.round(Number(durationRaw) * 60),
    isPreview: formData.get("isPreview") === "on",
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}

/**
 * Lesson uploads, called from the upload control rather than a plain form.
 *
 * These return a message instead of throwing: the control shows the reason
 * next to the file the instructor just chose, which a thrown error — a
 * generic error page — would take away from them.
 */
export type UploadActionResult = { ok: true } | { ok: false; message: string };

const UPLOAD_MESSAGES: Record<UploadError, string> = {
  NOT_FOUND: "That lesson no longer exists.",
  FORBIDDEN: "That upload does not belong to this lesson.",
  INVALID: "That upload is not valid.",
  LOCKED: "Withdraw the course to draft before changing its lessons.",
  UNSUPPORTED_TYPE: "Upload a PDF, a video (MP4, WebM or MOV) or audio (MP3, M4A, WAV, OGG).",
  TOO_LARGE: "That file is too large.",
  EMPTY: "That file is empty.",
  UNCONFIGURED: "File storage is not set up on this server.",
  MISSING: "The upload did not arrive. Please try again.",
};

function uploadMessage(error: UploadError, maxBytes?: number): string {
  if (error === "TOO_LARGE" && maxBytes) {
    return `That file is too large — the limit is ${Math.floor(maxBytes / (1024 * 1024))} MB.`;
  }
  return UPLOAD_MESSAGES[error];
}

export async function prepareLessonUploadAction(
  lessonId: string,
  file: { name: string; type: string; size: number },
): Promise<{ ok: true; key: string; url: string } | { ok: false; message: string }> {
  const user = await requireInstructor();
  const result = await prepareLessonUpload(lessonId, user.id, user.roles, file);
  if (!result.ok) return { ok: false, message: uploadMessage(result.error, result.maxBytes) };
  return { ok: true, key: result.data.key, url: result.data.url };
}

export async function attachLessonUploadAction(lessonId: string, key: string): Promise<UploadActionResult> {
  const user = await requireInstructor();
  const result = await attachLessonUpload(lessonId, user.id, user.roles, key);
  if (!result.ok) return { ok: false, message: uploadMessage(result.error) };

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
  return { ok: true };
}

export async function removeLessonUploadAction(lessonId: string): Promise<UploadActionResult> {
  const user = await requireInstructor();
  const result = await removeLessonUpload(lessonId, user.id, user.roles);
  if (!result.ok) return { ok: false, message: uploadMessage(result.error) };

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
  return { ok: true };
}

export async function deleteLessonAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const result = await deleteLesson(String(formData.get("lessonId") ?? ""), user.id, user.roles);
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}

export async function moveLessonAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const result = await moveLesson(
    String(formData.get("lessonId") ?? ""),
    user.id,
    user.roles,
    formData.get("direction") === "up" ? "up" : "down",
  );
  if (!result.ok) explode(result.error);

  revalidatePath(`/instructor/courses/${result.data.courseId}`);
}
