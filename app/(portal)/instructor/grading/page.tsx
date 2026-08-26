import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getGradingQueue } from "@/lib/assignments";
import { gradeSubmissionAction } from "./actions";

export const metadata: Metadata = { title: "Grading" };

/** Assignment grading queue (PRD §10.4). */
export default async function GradingPage() {
  const user = await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor/grading");
  const queue = await getGradingQueue(user.id, user.roles);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/instructor" className="text-sm text-muted-foreground hover:text-foreground">
          ← Instructor
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Grading</h1>
        <p className="mt-1 text-muted-foreground">
          {queue.length} submission{queue.length === 1 ? "" : "s"} awaiting a grade.
        </p>
      </header>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing is waiting to be graded.
        </p>
      ) : (
        <ul className="space-y-4">
          {queue.map((submission) => (
            <li key={submission.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{submission.studentName}</p>
                  <p className="text-sm text-muted-foreground">
                    {submission.assignment.title} · {submission.assignment.course.title}
                  </p>
                  {submission.submittedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Submitted{" "}
                      {submission.submittedAt.toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {submission.attemptNumber > 1 ? ` · attempt ${submission.attemptNumber}` : ""}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  {submission.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>

              {submission.notes && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm">
                  {submission.notes}
                </p>
              )}

              {submission.files.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {submission.files.map((file) => (
                    <li key={file.key}>
                      {file.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-muted"
                        >
                          {file.name} ↗
                        </a>
                      ) : (
                        <span className="inline-block rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                          {file.name} (unavailable)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form
                action={gradeSubmissionAction}
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
              >
                <input type="hidden" name="submissionId" value={submission.id} />

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Grade / {submission.assignment.maxPoints}
                  </span>
                  <input
                    name="grade"
                    type="number"
                    min="0"
                    max={submission.assignment.maxPoints}
                    required
                    className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                  />
                </label>

                <label className="min-w-48 flex-1">
                  <span className="mb-1.5 block text-sm font-medium">Feedback</span>
                  <input
                    name="feedback"
                    placeholder="What was good, and what to improve"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Save grade
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
