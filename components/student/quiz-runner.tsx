"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Quiz runner (PRD §9.5).
 *
 * Loads through /api/quizzes/:id and submits to /api/quizzes/:id/attempts, so
 * the answer key stays server-side. Nothing here can score an answer — the
 * result comes back from the grader.
 */
type Question = {
  id: string;
  type: string;
  prompt: string;
  options: unknown;
  points: number;
  position: number;
};

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  passingScore: number;
  attemptsUsed: number;
  maxAttempts: number | null;
  questions: Question[];
};

type Result = {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean | null;
  status: string;
  pendingManualCount: number;
};

export function QuizRunner({ quiz }: { quiz: Quiz }) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/quizzes/${quiz.id}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: quiz.questions.map((question) => ({
          questionId: question.id,
          response: responses[question.id] ?? null,
        })),
      }),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return setError(body.error ?? "We could not submit your attempt.");
    }

    setResult((await response.json()) as Result);
    // The attempt count on the listing page is now stale.
    router.refresh();
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="font-display text-4xl font-bold text-brand">{result.percentage}%</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.score} of {result.maxScore} points
        </p>

        {result.status === "PENDING_MANUAL_GRADING" ? (
          <p className="mt-4 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
            {result.pendingManualCount} written{" "}
            {result.pendingManualCount === 1 ? "answer needs" : "answers need"} manual grading. Your
            final result will appear once your instructor has reviewed it.
          </p>
        ) : (
          <p
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              result.passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {result.passed ? "Passed" : `Not passed — ${quiz.passingScore}% required`}
          </p>
        )}

        <Link
          href="/student/quizzes"
          className="mt-6 inline-block rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
        >
          Back to quizzes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quiz.questions.map((question, index) => (
        <fieldset key={question.id} className="rounded-2xl border border-border bg-surface p-6">
          <legend className="sr-only">Question {index + 1}</legend>
          <p className="text-sm text-muted-foreground">
            Question {index + 1} of {quiz.questions.length} · {question.points}{" "}
            {question.points === 1 ? "point" : "points"}
          </p>
          <p className="mt-2 font-medium">{question.prompt}</p>

          <div className="mt-4 space-y-2">
            <QuestionInput
              question={question}
              value={responses[question.id]}
              onChange={(value) => setResponses((prev) => ({ ...prev, [question.id]: value }))}
            />
          </div>
        </fieldset>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit attempt"}
      </button>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = Array.isArray(question.options) ? (question.options as unknown[]) : [];

  switch (question.type) {
    case "TRUE_FALSE":
      return (
        <>
          {[true, false].map((option) => (
            <label key={String(option)} className="flex items-center gap-3 text-sm">
              <input
                type="radio"
                name={question.id}
                checked={value === option}
                onChange={() => onChange(option)}
                className="accent-[var(--brand-green)]"
              />
              {option ? "True" : "False"}
            </label>
          ))}
        </>
      );

    case "CHECKBOX": {
      const selected = Array.isArray(value) ? (value as unknown[]) : [];
      return (
        <>
          {options.map((option, index) => (
            <label key={index} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option]
                      : selected.filter((item) => item !== option),
                  )
                }
                className="accent-[var(--brand-green)]"
              />
              {String(option)}
            </label>
          ))}
        </>
      );
    }

    case "ESSAY":
    case "SHORT_ANSWER":
      return (
        <textarea
          rows={question.type === "ESSAY" ? 6 : 2}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
      );

    // MULTIPLE_CHOICE, and a reasonable fallback for the ordering types until
    // their drag interfaces exist.
    default:
      return (
        <>
          {options.map((option, index) => (
            <label key={index} className="flex items-center gap-3 text-sm">
              <input
                type="radio"
                name={question.id}
                checked={value === option}
                onChange={() => onChange(option)}
                className="accent-[var(--brand-green)]"
              />
              {String(option)}
            </label>
          ))}
        </>
      );
  }
}
