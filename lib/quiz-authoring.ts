import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

/**
 * Quiz authoring for instructors (PRD §10.3).
 *
 * The course builder let an instructor set a minimum quiz score and gave them
 * no way to create the quiz that score applied to. Every quiz on the platform
 * existed because a script wrote it straight to the database.
 *
 * Only the two auto-gradable question types are offered. The enum carries
 * seven, but essays and drag-and-drop cannot be marked without a human, and a
 * question type that silently never grades would hold up certificate
 * eligibility with no way for the learner to find out why.
 */

export type AuthoringError = "NOT_FOUND" | "FORBIDDEN" | "INVALID";
export type Result<T> = { ok: true; data: T } | { ok: false; error: AuthoringError; detail?: string };

export type QuestionInput = {
  id?: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
  prompt: string;
  /** Multiple choice only. Two to six answers. */
  options?: string[];
  /** The option text for multiple choice, or true/false. */
  correctAnswer: string | boolean;
  explanation?: string | null;
  points: number;
};

/**
 * May this person edit this course's quizzes?
 *
 * The course's own instructor, or an admin. Checked against the course rather
 * than the quiz so a quiz cannot be reached by guessing an id.
 */
async function canEditCourse(courseId: string, userId: string, roles: string[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, instructorId: true },
  });
  if (!course) return { ok: false as const, error: "NOT_FOUND" as const };
  if (course.instructorId !== userId && !isAdmin(roles)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  return { ok: true as const, course };
}

export async function createQuiz(
  courseId: string,
  input: { title: string; description?: string | null; passingScore: number; lessonId?: string | null },
  userId: string,
  roles: string[],
): Promise<Result<{ id: string }>> {
  const allowed = await canEditCourse(courseId, userId, roles);
  if (!allowed.ok) return allowed;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "INVALID", detail: "A quiz needs a title." };

  if (input.passingScore < 0 || input.passingScore > 100) {
    return { ok: false, error: "INVALID", detail: "The passing score is a percentage." };
  }

  const quiz = await prisma.quiz.create({
    data: {
      courseId,
      title,
      description: input.description?.trim() || null,
      passingScore: input.passingScore,
      lessonId: input.lessonId || null,
    },
    select: { id: true },
  });

  return { ok: true, data: quiz };
}

export async function updateQuiz(
  quizId: string,
  input: { title: string; description?: string | null; passingScore: number },
  userId: string,
  roles: string[],
): Promise<Result<null>> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { courseId: true } });
  if (!quiz) return { ok: false, error: "NOT_FOUND" };

  const allowed = await canEditCourse(quiz.courseId, userId, roles);
  if (!allowed.ok) return allowed;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "INVALID", detail: "A quiz needs a title." };

  await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title,
      description: input.description?.trim() || null,
      passingScore: Math.min(100, Math.max(0, input.passingScore)),
    },
  });

  return { ok: true, data: null };
}

/**
 * Delete a quiz.
 *
 * Refused once anyone has attempted it. An attempt is a record of what a
 * learner did, and deleting the quiz cascades those away — which would also
 * change certificate eligibility retroactively for people who had already
 * passed.
 */
export async function deleteQuiz(
  quizId: string,
  userId: string,
  roles: string[],
): Promise<Result<null>> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true, _count: { select: { attempts: true } } },
  });
  if (!quiz) return { ok: false, error: "NOT_FOUND" };

  const allowed = await canEditCourse(quiz.courseId, userId, roles);
  if (!allowed.ok) return allowed;

  if (quiz._count.attempts > 0) {
    return {
      ok: false,
      error: "INVALID",
      detail: `${quiz._count.attempts} learner(s) have attempted this quiz, so it cannot be deleted.`,
    };
  }

  await prisma.quiz.delete({ where: { id: quizId } });
  return { ok: true, data: null };
}

/** Shared validation, so a question saved by hand and one drafted by the model are held to the same standard. */
export function validateQuestion(question: QuestionInput): string | null {
  if (!question.prompt.trim()) return "Every question needs a prompt.";
  if (question.points < 1) return "A question must be worth at least one point.";

  if (question.type === "TRUE_FALSE") {
    if (typeof question.correctAnswer !== "boolean") {
      return "A true/false question needs true or false as its answer.";
    }
    return null;
  }

  const options = (question.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) return "A multiple choice question needs at least two options.";
  if (options.length > 6) return "Six options is the most a question should offer.";
  if (new Set(options).size !== options.length) return "Two options are identical.";

  if (typeof question.correctAnswer !== "string" || !options.includes(question.correctAnswer.trim())) {
    return "The correct answer must be one of the options.";
  }

  return null;
}

/**
 * Create or update a question.
 *
 * Position is assigned here rather than accepted, because the unique
 * constraint on (quizId, position) turns a client-supplied value into a
 * collision waiting for two people editing at once.
 */
export async function saveQuestion(
  quizId: string,
  question: QuestionInput,
  userId: string,
  roles: string[],
): Promise<Result<{ id: string }>> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { courseId: true } });
  if (!quiz) return { ok: false, error: "NOT_FOUND" };

  const allowed = await canEditCourse(quiz.courseId, userId, roles);
  if (!allowed.ok) return allowed;

  const problem = validateQuestion(question);
  if (problem) return { ok: false, error: "INVALID", detail: problem };

  const options =
    question.type === "MULTIPLE_CHOICE"
      ? (question.options ?? []).map((option) => option.trim()).filter(Boolean)
      : [];

  const data = {
    type: question.type,
    prompt: question.prompt.trim(),
    options,
    correctAnswer:
      question.type === "TRUE_FALSE"
        ? question.correctAnswer
        : String(question.correctAnswer).trim(),
    explanation: question.explanation?.trim() || null,
    points: question.points,
  };

  if (question.id) {
    const existing = await prisma.question.findFirst({
      where: { id: question.id, quizId },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    await prisma.question.update({ where: { id: existing.id }, data });
    return { ok: true, data: { id: existing.id } };
  }

  const last = await prisma.question.findFirst({
    where: { quizId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await prisma.question.create({
    data: { ...data, quizId, position: (last?.position ?? 0) + 1 },
    select: { id: true },
  });

  return { ok: true, data: created };
}

export async function deleteQuestion(
  questionId: string,
  userId: string,
  roles: string[],
): Promise<Result<null>> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { quiz: { select: { courseId: true } } },
  });
  if (!question) return { ok: false, error: "NOT_FOUND" };

  const allowed = await canEditCourse(question.quiz.courseId, userId, roles);
  if (!allowed.ok) return allowed;

  await prisma.question.delete({ where: { id: questionId } });
  return { ok: true, data: null };
}

export async function getQuizForAuthor(quizId: string, userId: string, roles: string[]) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true, title: true, description: true, passingScore: true, courseId: true,
      course: { select: { id: true, title: true, instructorId: true } },
      questions: {
        orderBy: { position: "asc" },
        select: {
          id: true, type: true, prompt: true, options: true,
          correctAnswer: true, explanation: true, points: true, position: true,
        },
      },
      _count: { select: { attempts: true } },
    },
  });

  if (!quiz) return null;
  if (quiz.course.instructorId !== userId && !isAdmin(roles)) return null;

  return quiz;
}

/** Lesson text for the whole course, for the model to draft questions from. */
export async function getCourseText(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      description: true,
      modules: {
        orderBy: { position: "asc" },
        select: {
          title: true,
          lessons: {
            orderBy: { position: "asc" },
            select: { title: true, content: true },
          },
        },
      },
    },
  });
}
