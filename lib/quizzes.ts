import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import { evaluateBadges, recordActivity, XP } from "@/lib/gamification";
import type { QuestionType } from "@/app/generated/prisma/enums";

/**
 * Quiz delivery and grading (PRD §9.5).
 *
 * `questions` is instructor-only under RLS because a row-level grant would also
 * expose "correctAnswer". Students receive quizzes through here instead, where
 * the answer key is stripped on the way out and only ever compared server-side.
 */

/** A question as a student is allowed to see it — no answer key, no explanation. */
export type StudentQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: unknown;
  points: number;
  position: number;
};

export type QuizDeliveryError =
  | "NOT_FOUND"
  | "NOT_ENROLLED"
  | "ATTEMPT_LIMIT_REACHED";

export type QuizDelivery = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number | null;
  attemptsUsed: number;
  questions: StudentQuestion[];
};

/** Objective types the engine can score without a human. */
const AUTO_GRADED: QuestionType[] = [
  "MULTIPLE_CHOICE",
  "CHECKBOX",
  "TRUE_FALSE",
  "DRAG_AND_DROP",
  "MATCHING",
];

export async function getQuizForStudent(
  db: PrismaClient,
  quizId: string,
  userId: string,
): Promise<{ ok: true; quiz: QuizDelivery } | { ok: false; error: QuizDeliveryError }> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      description: true,
      timeLimitMinutes: true,
      passingScore: true,
      maxAttempts: true,
      shuffleQuestions: true,
      courseId: true,
      questions: {
        orderBy: { position: "asc" },
        // The answer key is excluded at the query level, not filtered afterwards,
        // so it never enters the process at all.
        select: { id: true, type: true, prompt: true, options: true, points: true, position: true },
      },
    },
  });

  if (!quiz) return { ok: false, error: "NOT_FOUND" };

  const enrollment = await db.enrollment.findFirst({
    where: { courseId: quiz.courseId, userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });

  // Same response as a missing quiz would give: whether a quiz exists in a
  // course you cannot see is not information an outsider should get.
  if (!enrollment) return { ok: false, error: "NOT_ENROLLED" };

  const attemptsUsed = await db.quizAttempt.count({ where: { quizId, userId } });

  if (quiz.maxAttempts !== null && attemptsUsed >= quiz.maxAttempts) {
    return { ok: false, error: "ATTEMPT_LIMIT_REACHED" };
  }

  const questions = quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions;

  return {
    ok: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      timeLimitMinutes: quiz.timeLimitMinutes,
      passingScore: quiz.passingScore,
      maxAttempts: quiz.maxAttempts,
      attemptsUsed,
      questions,
    },
  };
}

export type SubmittedAnswer = { questionId: string; response: unknown };

export type GradedAttempt = {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean | null;
  status: "AUTO_GRADED" | "PENDING_MANUAL_GRADING";
  pendingManualCount: number;
};

/**
 * Score a submission and persist the attempt.
 *
 * Grading happens here — never in the client — because the client is never
 * given the answer key. Essay and short-answer responses are stored unscored
 * and the attempt is held for manual grading (PRD §9.5).
 */
export async function gradeAttempt(
  db: PrismaClient,
  quizId: string,
  userId: string,
  answers: SubmittedAnswer[],
): Promise<{ ok: true; result: GradedAttempt } | { ok: false; error: QuizDeliveryError }> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      courseId: true,
      passingScore: true,
      maxAttempts: true,
      questions: { select: { id: true, type: true, correctAnswer: true, points: true } },
    },
  });

  if (!quiz) return { ok: false, error: "NOT_FOUND" };

  const enrollment = await db.enrollment.findFirst({
    where: { courseId: quiz.courseId, userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });

  if (!enrollment) return { ok: false, error: "NOT_ENROLLED" };

  const attemptsUsed = await db.quizAttempt.count({ where: { quizId, userId } });

  if (quiz.maxAttempts !== null && attemptsUsed >= quiz.maxAttempts) {
    return { ok: false, error: "ATTEMPT_LIMIT_REACHED" };
  }

  const submitted = new Map(answers.map((a) => [a.questionId, a.response]));

  let score = 0;
  let maxScore = 0;
  let pendingManualCount = 0;

  const graded = quiz.questions.map((question) => {
    maxScore += question.points;
    // A question the student left out is a wrong answer, not a skipped one —
    // otherwise omitting hard questions would raise the percentage.
    const response = submitted.get(question.id) ?? null;

    if (!AUTO_GRADED.includes(question.type)) {
      pendingManualCount += 1;
      return { questionId: question.id, response, isCorrect: null, pointsAwarded: null };
    }

    const isCorrect = matchesAnswer(question.type, response, question.correctAnswer);
    if (isCorrect) score += question.points;

    return {
      questionId: question.id,
      response,
      isCorrect,
      pointsAwarded: isCorrect ? question.points : 0,
    };
  });

  const status = pendingManualCount > 0 ? "PENDING_MANUAL_GRADING" : "AUTO_GRADED";
  const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);

  const attempt = await db.quizAttempt.create({
    data: {
      quizId,
      userId,
      enrollmentId: enrollment.id,
      attemptNumber: attemptsUsed + 1,
      status,
      score,
      maxScore,
      // Pass/fail stays undecided while essays are outstanding — a partial score
      // must not read as a fail (which would gate certificate eligibility).
      passed: status === "AUTO_GRADED" ? percentage >= quiz.passingScore : null,
      submittedAt: new Date(),
      gradedAt: status === "AUTO_GRADED" ? new Date() : null,
      answers: {
        create: graded.map((g) => ({
          questionId: g.questionId,
          // A skipped question is stored as JSON null, not SQL NULL: the row
          // must record that the student left it blank.
          response: g.response === null ? Prisma.JsonNull : (g.response as Prisma.InputJsonValue),
          isCorrect: g.isCorrect,
          pointsAwarded: g.pointsAwarded,
        })),
      },
    },
    select: { id: true, passed: true },
  });

  // A pass earns XP; a failed attempt still counts as activity for the streak.
  await recordActivity(userId, attempt.passed ? XP.QUIZ_PASSED : 0).catch(() => {});
  await evaluateBadges(userId).catch(() => {});

  return {
    ok: true,
    result: {
      attemptId: attempt.id,
      score,
      maxScore,
      percentage,
      passed: attempt.passed,
      status,
      pendingManualCount,
    },
  };
}

/** Compare a response to the stored key, per question type. */
function matchesAnswer(type: QuestionType, response: unknown, key: unknown): boolean {
  if (key === null || key === undefined || response === null || response === undefined) {
    return false;
  }

  switch (type) {
    // Order is irrelevant for multi-select and matching, so compare as sets.
    case "CHECKBOX":
    case "MATCHING":
      return setsEqual(response, key);
    // Drag-and-drop is a sequence: order is the answer.
    case "DRAG_AND_DROP":
      return JSON.stringify(normalise(response)) === JSON.stringify(normalise(key));
    default:
      return normaliseScalar(response) === normaliseScalar(key);
  }
}

function setsEqual(a: unknown, b: unknown): boolean {
  const left = toArray(a).map(normaliseScalar).sort();
  const right = toArray(b).map(normaliseScalar).sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function normalise(value: unknown): unknown {
  return Array.isArray(value) ? value.map(normaliseScalar) : normaliseScalar(value);
}

/** Case- and whitespace-insensitive, so "True" and "true " both match. */
function normaliseScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim().toLowerCase();
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
