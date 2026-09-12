"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  // Finishing the last lesson used to leave the learner sitting on it, with a
  // panel of links and no obvious next move. The assessment is the next step
  // on a course that has one, and the certificate is the point of the course,
  // so send them rather than describe the way.
  if (result.finished) {
    if (result.nextQuizId) redirect(`/student/quizzes/${result.nextQuizId}`);
    if (result.certificate) redirect("/student/certificates");
  }
}
