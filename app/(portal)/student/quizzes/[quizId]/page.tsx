import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getQuizForStudent } from "@/lib/quizzes";
import { QuizRunner } from "@/components/student/quiz-runner";

export const metadata: Metadata = { title: "Quiz" };

/**
 * Quiz attempt page.
 *
 * Delivery goes through the same getQuizForStudent() the API route uses, so
 * the answer key is excluded by the same query — there is no second code path
 * that could drift and start leaking it.
 */
export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const user = await requireUser(`/student/quizzes/${quizId}`);
  const result = await getQuizForStudent(prisma, quizId, user.id);

  if (!result.ok) {
    if (result.error === "ATTEMPT_LIMIT_REACHED") {
      return (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center">
          <h1 className="font-display text-xl font-semibold">No attempts remaining</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You have used all available attempts for this quiz.
          </p>
          <Link
            href="/student/quizzes"
            className="mt-6 inline-block rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
          >
            Back to quizzes
          </Link>
        </div>
      );
    }
    notFound();
  }

  const { quiz } = result;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/student/quizzes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Quizzes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{quiz.title}</h1>
        {quiz.description && <p className="mt-2 text-muted-foreground">{quiz.description}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          Pass mark {quiz.passingScore}%
          {quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} minute limit` : ""} · attempt{" "}
          {quiz.attemptsUsed + 1}
          {quiz.maxAttempts ? ` of ${quiz.maxAttempts}` : ""}
        </p>
      </header>

      <QuizRunner quiz={quiz} />
    </div>
  );
}
