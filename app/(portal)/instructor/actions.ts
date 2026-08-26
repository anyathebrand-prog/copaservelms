"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  addLesson,
  addModule,
  createCourse,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  setCourseStatus,
  updateCourseDetails,
  updateLesson,
  type MutationError,
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

  const result = await createCourse(user.id, {
    title: String(formData.get("title") ?? ""),
    categoryId: (formData.get("categoryId") as string) || null,
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

  const result = await updateCourseDetails(courseId, user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    subtitle: (formData.get("subtitle") as string) || null,
    description: (formData.get("description") as string) || null,
    level: (formData.get("level") as CourseLevel) || undefined,
    // The form collects naira; the column stores kobo.
    priceMinor: priceRaw === "" ? undefined : Math.round(Number(priceRaw) * 100),
    estimatedMinutes: minutesRaw === "" ? null : Number(minutesRaw),
    categoryId: (formData.get("categoryId") as string) || null,
    minQuizScore: minQuizRaw === "" ? null : Number(minQuizRaw),
    requiresAssignments: formData.get("requiresAssignments") === "on",
    certificateEnabled: formData.get("certificateEnabled") === "on",
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/instructor/courses/${courseId}`);
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
    contentUrl: (formData.get("contentUrl") as string) || null,
    content: (formData.get("content") as string) || null,
    durationSeconds: durationRaw === "" ? null : Math.round(Number(durationRaw) * 60),
    isPreview: formData.get("isPreview") === "on",
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/instructor/courses/${result.data.courseId}`);
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
