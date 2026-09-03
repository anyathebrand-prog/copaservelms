import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getQuizForAuthor } from "@/lib/quiz-authoring";
import { generationConfigured } from "@/lib/quiz-generation";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { QuizEditor } from "@/components/instructor/quiz-editor";
import { deleteQuizAction, updateQuizAction } from "../actions";

export const metadata: Metadata = { title: "Edit quiz" };
export const dynamic = "force-dynamic";

/** Quiz authoring (PRD §10.3). */
export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ courseId: string; quizId: string }>;
}) {
  const { courseId, quizId } = await params;
  const user = await requireRole(
    ["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"],
    `/instructor/courses/${courseId}/quizzes/${quizId}`,
  );

  const quiz = await getQuizForAuthor(quizId, user.id, user.roles);
  if (!quiz) notFound();

  // Once people have attempted it, editing the questions would change what
  // they were marked against after the fact.
  const locked = quiz._count.attempts > 0;

  return (
    <div className="space-y-7">
      <header>
        <Link
          href={`/instructor/courses/${courseId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {quiz.course.title}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{quiz.title}</h1>
      </header>

      {locked && (
        <p className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm text-warning">
          {quiz._count.attempts} learner{quiz._count.attempts === 1 ? " has" : "s have"} attempted
          this quiz, so its questions are locked. Changing them now would alter what those people
          were marked against.
        </p>
      )}

      <Panel title="Settings">
        <form action={updateQuizAction} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="quizId" value={quiz.id} />
          <input type="hidden" name="courseId" value={courseId} />

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              defaultValue={quiz.title}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Description</span>
            <input
              name="description"
              defaultValue={quiz.description ?? ""}
              placeholder="Shown before the learner begins"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Pass mark (%)</span>
            <input
              name="passingScore"
              type="number"
              min={0}
              max={100}
              defaultValue={quiz.passingScore}
              className="w-28 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <div className="sm:col-span-2">
            <SubmitButton
              pendingLabel="Saving..."
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Save settings
            </SubmitButton>
          </div>
        </form>
      </Panel>

      <QuizEditor
        courseId={courseId}
        quizId={quiz.id}
        questions={quiz.questions}
        generationAvailable={generationConfigured()}
        locked={locked}
      />

      {!locked && (
        <form action={deleteQuizAction} className="border-t border-border pt-6">
          <input type="hidden" name="quizId" value={quiz.id} />
          <input type="hidden" name="courseId" value={courseId} />
          <SubmitButton
            pendingLabel="Deleting..."
            className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            Delete this quiz
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
