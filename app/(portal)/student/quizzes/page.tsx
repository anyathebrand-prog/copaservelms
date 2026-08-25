import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getStudentQuizzes } from "@/lib/student";

export const metadata: Metadata = { title: "Quizzes" };

export default async function QuizzesPage() {
  const user = await requireUser("/student/quizzes");
  const quizzes = await getStudentQuizzes(user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Quizzes</h1>
        <p className="mt-1 text-muted-foreground">Results feed directly into certificate eligibility.</p>
      </header>

      {quizzes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No quizzes are available in your enrolled courses yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map((quiz) => {
            const exhausted = quiz.maxAttempts !== null && quiz.attemptsUsed >= quiz.maxAttempts;
            const best = quiz.bestAttempt;
            const percentage =
              best?.score != null && best.maxScore
                ? Math.round((best.score / best.maxScore) * 100)
                : null;

            return (
              <li
                key={quiz.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{quiz.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {quiz.course.title} · {quiz._count.questions} questions · pass mark{" "}
                    {quiz.passingScore}%
                    {quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quiz.attemptsUsed} of {quiz.maxAttempts ?? "unlimited"} attempts used
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {percentage !== null && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        best?.passed === true
                          ? "bg-success/10 text-success"
                          : best?.passed === false
                            ? "bg-danger/10 text-danger"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {percentage}%
                    </span>
                  )}

                  {exhausted ? (
                    <span className="text-sm text-muted-foreground">No attempts left</span>
                  ) : (
                    <Link
                      href={`/student/quizzes/${quiz.id}`}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      {quiz.attemptsUsed > 0 ? "Retake" : "Start"}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
