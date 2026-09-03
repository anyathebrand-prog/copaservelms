import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { createQuizAction } from "@/app/(portal)/instructor/courses/[courseId]/quizzes/actions";

/**
 * Quizzes on a course, in the builder.
 *
 * This sat missing while the settings above it asked for a minimum quiz score,
 * which meant the form referred to something the instructor had no way to
 * create.
 */
export function QuizzesSection({
  courseId,
  quizzes,
  locked,
}: {
  courseId: string;
  quizzes: {
    id: string;
    title: string;
    passingScore: number;
    _count: { questions: number; attempts: number };
  }[];
  locked: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-xl font-semibold">Quizzes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A learner must pass these before the course issues a certificate.
      </p>

      {quizzes.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          No quizzes yet. A course can be completed without one — the certificate is then issued on
          finishing the lessons.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {quizzes.map((quiz) => (
            <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link
                  href={`/instructor/courses/${courseId}/quizzes/${quiz.id}`}
                  className="flex items-center gap-2 font-medium transition hover:text-brand"
                >
                  <ClipboardCheck className="size-4 text-muted-foreground" />
                  {quiz.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {quiz._count.questions} question{quiz._count.questions === 1 ? "" : "s"} · pass at{" "}
                  {quiz.passingScore}%
                  {quiz._count.attempts > 0
                    ? ` · ${quiz._count.attempts} attempt${quiz._count.attempts === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>

              <Link
                href={`/instructor/courses/${courseId}/quizzes/${quiz.id}`}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
              >
                {quiz._count.attempts > 0 ? "View" : "Edit"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <form action={createQuizAction} className="mt-6 flex flex-wrap items-end gap-3 border-t border-border pt-6">
          <input type="hidden" name="courseId" value={courseId} />
          <label className="min-w-56 flex-1">
            <span className="mb-1.5 block text-sm font-medium">New quiz</span>
            <input
              name="title"
              required
              placeholder="End of course assessment"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Pass mark (%)</span>
            <input
              name="passingScore"
              type="number"
              min={0}
              max={100}
              defaultValue={70}
              className="w-28 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <SubmitButton
            pendingLabel="Creating..."
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Plus className="size-4" />
            Create quiz
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
