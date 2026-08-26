"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { markLessonComplete } from "@/lib/student";

/**
 * Mark a lesson complete.
 *
 * Server Actions are public HTTP endpoints, so the caller is re-derived from
 * the session here rather than trusted from the form — a userId in a hidden
 * field would let anyone advance anyone else's progress.
 */
export async function completeLessonAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const lessonId = formData.get("lessonId");
  const slug = formData.get("slug");

  if (typeof lessonId !== "string" || typeof slug !== "string") {
    throw new Error("Invalid lesson submission.");
  }

  // Enrollment is verified inside markLessonComplete, not here.
  const result = await markLessonComplete(user.id, lessonId);

  // Throw rather than return: a form action must resolve to void, and a
  // silently ignored failure would leave the button looking like it worked.
  if (!result.ok) throw new Error(`Could not mark lesson complete: ${result.error}`);

  revalidatePath(`/student/courses/${slug}`);
  revalidatePath("/student");
}
