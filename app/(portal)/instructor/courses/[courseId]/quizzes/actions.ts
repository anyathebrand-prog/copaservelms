"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  saveQuestion,
  updateQuiz,
  type AuthoringError,
  type QuestionInput,
} from "@/lib/quiz-authoring";
import { draftQuestions } from "@/lib/quiz-generation";

const MESSAGES: Record<AuthoringError, string> = {
  NOT_FOUND: "That no longer exists.",
  FORBIDDEN: "This is not your course.",
  INVALID: "Please check the form and try again.",
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

/** Read one question out of the form. Naira-style unit conversion has no analogue here; this is shape only. */
function readQuestion(formData: FormData): QuestionInput {
  const type = String(formData.get("type") ?? "MULTIPLE_CHOICE") as QuestionInput["type"];
  const options = (formData.getAll("option") as string[]).map((o) => o.trim()).filter(Boolean);

  return {
    id: (formData.get("questionId") as string) || undefined,
    type,
    prompt: String(formData.get("prompt") ?? ""),
    options: type === "MULTIPLE_CHOICE" ? options : [],
    correctAnswer:
      type === "TRUE_FALSE"
        ? String(formData.get("correctAnswer") ?? "true") === "true"
        : String(formData.get("correctAnswer") ?? ""),
    explanation: String(formData.get("explanation") ?? ""),
    points: Number.parseInt(String(formData.get("points") ?? "10"), 10) || 10,
  };
}

export async function createQuizAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const courseId = String(formData.get("courseId") ?? "");

  const result = await createQuiz(
    courseId,
    {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      passingScore: Number.parseInt(String(formData.get("passingScore") ?? "70"), 10) || 70,
    },
    user.id,
    user.roles,
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/instructor/courses/${courseId}`);
  redirect(`/instructor/courses/${courseId}/quizzes/${result.data.id}`);
}

export async function updateQuizAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const quizId = String(formData.get("quizId") ?? "");

  const result = await updateQuiz(
    quizId,
    {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      passingScore: Number.parseInt(String(formData.get("passingScore") ?? "70"), 10) || 70,
    },
    user.id,
    user.roles,
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);
  revalidatePath(`/instructor/courses/${formData.get("courseId")}/quizzes/${quizId}`);
}

export async function deleteQuizAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const courseId = String(formData.get("courseId") ?? "");

  const result = await deleteQuiz(String(formData.get("quizId") ?? ""), user.id, user.roles);
  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/instructor/courses/${courseId}`);
  redirect(`/instructor/courses/${courseId}`);
}

export async function saveQuestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const quizId = String(formData.get("quizId") ?? "");

  const result = await saveQuestion(quizId, readQuestion(formData), user.id, user.roles);
  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/instructor/courses/${formData.get("courseId")}/quizzes/${quizId}`);
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const result = await deleteQuestion(String(formData.get("questionId") ?? ""), user.id, user.roles);
  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/instructor/courses/${formData.get("courseId")}/quizzes/${formData.get("quizId")}`);
}

/**
 * Draft questions with the model.
 *
 * Returns them to the browser for review. Deliberately does not save: an
 * instructor reads each one and presses save on the ones they accept, because
 * a wrong answer key here becomes a certificate attesting to a falsehood.
 */
export async function draftQuestionsAction(
  courseId: string,
  count: number,
): Promise<
  | { ok: true; questions: QuestionInput[]; rejected: number }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  // The same ownership gate as saving, so drafting cannot be used to read the
  // lesson text of a course you do not own.
  const check = await saveQuestionGuard(courseId, user.id, user.roles);
  if (!check.ok) return { ok: false, error: check.error };

  const result = await draftQuestions(courseId, count);

  if (!result.ok) {
    const messages: Record<string, string> = {
      NOT_CONFIGURED: "Drafting is not configured on this deployment.",
      NO_CONTENT: "This course has no written lesson text to draft from.",
      NOT_FOUND: "That course no longer exists.",
      FAILED: "Drafting failed. Try again.",
    };
    return { ok: false, error: result.detail ?? messages[result.error] ?? "Drafting failed." };
  }

  return { ok: true, questions: result.data.questions, rejected: result.data.rejected };
}

/** Ownership check reused by drafting, which has no quiz to hang one off. */
async function saveQuestionGuard(
  courseId: string,
  userId: string,
  roles: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { prisma } = await import("@/lib/prisma");
  const { isAdmin } = await import("@/lib/admin");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });

  if (!course) return { ok: false, error: "That course no longer exists." };
  if (course.instructorId !== userId && !isAdmin(roles)) {
    return { ok: false, error: "This is not your course." };
  }
  return { ok: true };
}
