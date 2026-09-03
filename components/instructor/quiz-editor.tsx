"use client";

import { useState } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { QuestionInput } from "@/lib/quiz-authoring";
import {
  deleteQuestionAction,
  draftQuestionsAction,
  saveQuestionAction,
} from "@/app/(portal)/instructor/courses/[courseId]/quizzes/actions";

/**
 * Write questions, or have them drafted and then write them.
 *
 * Drafted questions arrive as unsaved cards in the same form as a hand-written
 * one. Nothing a model produced reaches a learner until an instructor has read
 * it and pressed save — which is the point rather than a formality, because a
 * wrong answer key here becomes a certificate asserting something false.
 */
type Saved = {
  id: string;
  type: string;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  points: number;
};

export function QuizEditor({
  courseId,
  quizId,
  questions,
  generationAvailable,
  locked,
}: {
  courseId: string;
  quizId: string;
  questions: Saved[];
  generationAvailable: boolean;
  locked: boolean;
}) {
  const [drafts, setDrafts] = useState<QuestionInput[]>([]);
  const [adding, setAdding] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function draft(count: number) {
    setError(null);
    setNotice(null);
    setDrafting(true);

    try {
      const result = await draftQuestionsAction(courseId, count);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDrafts(result.questions);
      setNotice(
        `${result.questions.length} drafted. Read each one before saving it${
          result.rejected > 0 ? ` — ${result.rejected} were discarded as malformed` : ""
        }.`,
      );
    } catch {
      setError("Drafting failed. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* --- drafting -------------------------------------------------- */}
      {generationAvailable && !locked && (
        <div className="rounded-2xl border border-brand/20 bg-brand-pale/40 p-5">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-brand" />
            Draft questions from the lesson text
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reads this course&rsquo;s lessons and proposes questions. Nothing is saved — you review
            each one and keep what is right. A wrong answer key becomes a certificate saying
            something false, so this step is yours.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {[5, 8, 12].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => draft(count)}
                disabled={drafting}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {drafting ? "Drafting…" : `Draft ${count}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* --- drafted, unsaved ------------------------------------------ */}
      {drafts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">
              Drafted — not saved ({drafts.length})
            </h3>
            <button
              type="button"
              onClick={() => setDrafts([])}
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              Discard all
            </button>
          </div>

          {drafts.map((draftQuestion, index) => (
            <QuestionForm
              key={`draft-${index}`}
              courseId={courseId}
              quizId={quizId}
              initial={draftQuestion}
              badge="drafted"
              onDone={() => setDrafts((current) => current.filter((_, i) => i !== index))}
              onDiscard={() => setDrafts((current) => current.filter((_, i) => i !== index))}
            />
          ))}
        </section>
      )}

      {/* --- saved ------------------------------------------------------ */}
      <section className="space-y-4">
        <h3 className="font-display font-semibold">
          Questions ({questions.length})
        </h3>

        {questions.length === 0 && drafts.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            No questions yet. Add one, or draft from the lesson text.
          </p>
        )}

        {questions.map((question) => (
          <QuestionForm
            key={question.id}
            courseId={courseId}
            quizId={quizId}
            locked={locked}
            initial={{
              id: question.id,
              type: question.type as QuestionInput["type"],
              prompt: question.prompt,
              options: Array.isArray(question.options) ? (question.options as string[]) : [],
              correctAnswer:
                question.type === "TRUE_FALSE"
                  ? question.correctAnswer === true
                  : String(question.correctAnswer ?? ""),
              explanation: question.explanation,
              points: question.points,
            }}
          />
        ))}
      </section>

      {/* --- add by hand ------------------------------------------------ */}
      {!locked &&
        (adding ? (
          <QuestionForm
            courseId={courseId}
            quizId={quizId}
            initial={{
              type: "MULTIPLE_CHOICE",
              prompt: "",
              options: ["", ""],
              correctAnswer: "",
              explanation: "",
              points: 10,
            }}
            badge="new"
            onDone={() => setAdding(false)}
            onDiscard={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
          >
            <Plus className="size-4" />
            Add a question
          </button>
        ))}
    </div>
  );
}

/** One question, editable. Used for saved, drafted and brand-new alike. */
function QuestionForm({
  courseId,
  quizId,
  initial,
  badge,
  locked = false,
  onDone,
  onDiscard,
}: {
  courseId: string;
  quizId: string;
  initial: QuestionInput;
  badge?: "drafted" | "new";
  locked?: boolean;
  onDone?: () => void;
  onDiscard?: () => void;
}) {
  const [type, setType] = useState(initial.type);
  const [options, setOptions] = useState<string[]>(
    initial.options?.length ? initial.options : ["", ""],
  );
  const [correct, setCorrect] = useState(String(initial.correctAnswer ?? ""));

  return (
    <form
      action={async (formData) => {
        await saveQuestionAction(formData);
        onDone?.();
      }}
      className={`rounded-2xl border p-5 ${
        badge ? "border-brand/30 bg-brand-pale/20" : "border-border bg-surface"
      }`}
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="quizId" value={quizId} />
      {initial.id && <input type="hidden" name="questionId" value={initial.id} />}

      {badge && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">
          {badge === "drafted" ? "Drafted — review before saving" : "New question"}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="block sm:col-span-3">
          <span className="mb-1.5 block text-sm font-medium">Question</span>
          <textarea
            name="prompt"
            required
            rows={2}
            defaultValue={initial.prompt}
            disabled={locked}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Type</span>
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as QuestionInput["type"])}
            disabled={locked}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
          >
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="TRUE_FALSE">True or false</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Points</span>
          <input
            name="points"
            type="number"
            min={1}
            defaultValue={initial.points}
            disabled={locked}
            className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
          />
        </label>
      </div>

      {type === "MULTIPLE_CHOICE" ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">
            Options <span className="font-normal text-muted-foreground">(select the correct one)</span>
          </legend>

          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correctAnswer"
                  value={option}
                  checked={correct === option && option !== ""}
                  onChange={() => setCorrect(option)}
                  disabled={locked}
                  aria-label={`Option ${index + 1} is correct`}
                  className="size-4 shrink-0 accent-[#0a510e]"
                />
                <input
                  name="option"
                  value={option}
                  onChange={(event) => {
                    const next = [...options];
                    const previous = next[index];
                    next[index] = event.target.value;
                    setOptions(next);
                    if (correct === previous) setCorrect(event.target.value);
                  }}
                  placeholder={`Option ${index + 1}`}
                  disabled={locked}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, i) => i !== index))}
                  disabled={locked || options.length <= 2}
                  aria-label="Remove option"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-surface-muted disabled:opacity-40"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          {!locked && options.length < 6 && (
            <button
              type="button"
              onClick={() => setOptions([...options, ""])}
              className="mt-2 text-sm font-medium text-brand hover:underline"
            >
              Add option
            </button>
          )}
        </fieldset>
      ) : (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Correct answer</legend>
          <div className="flex gap-4">
            {["true", "false"].map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="correctAnswer"
                  value={value}
                  defaultChecked={String(initial.correctAnswer) === value}
                  disabled={locked}
                  className="size-4 accent-[#0a510e]"
                />
                {value === "true" ? "True" : "False"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium">
          Explanation <span className="font-normal text-muted-foreground">(shown after answering)</span>
        </span>
        <textarea
          name="explanation"
          rows={2}
          defaultValue={initial.explanation ?? ""}
          disabled={locked}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
        />
      </label>

      {!locked && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <SubmitButton
            pendingLabel="Saving..."
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {initial.id ? "Save changes" : "Save question"}
          </SubmitButton>

          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Discard
            </button>
          )}
        </div>
      )}

      {initial.id && !locked && (
        <div className="mt-3">
          <button
            type="submit"
            formAction={deleteQuestionAction}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
          >
            <Trash2 className="size-3.5" />
            Delete question
          </button>
        </div>
      )}
    </form>
  );
}
