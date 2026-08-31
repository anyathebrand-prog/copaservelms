import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getAssignmentForStudent } from "@/lib/assignments";
import { removeFileAction, saveSubmissionAction } from "./actions";

export const metadata: Metadata = { title: "Assignment" };

/** Assignment submission (PRD §9.6). */
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireUser(`/student/assignments/${assignmentId}`);
  const context = await getAssignmentForStudent(assignmentId, user.id);

  if (!context) notFound();

  const { assignment, submission, files, allowedTypes, maxFileMb, pastDue } = context;

  const graded = submission?.status === "GRADED";
  const locked = graded && !assignment.allowResubmission;
  const rubric = Array.isArray(assignment.rubric) ? (assignment.rubric as { criterion?: string; points?: number }[]) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/student/assignments" className="text-sm text-muted-foreground hover:text-foreground">
          ← Assignments
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{assignment.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {assignment.course.title} · {assignment.maxPoints} points
          {assignment.isRequiredForCertificate ? " · required for your certificate" : ""}
        </p>
        {assignment.dueAt && (
          <p className={`mt-1 text-sm ${pastDue && !graded ? "text-danger" : "text-muted-foreground"}`}>
            Due {assignment.dueAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
            {pastDue ? " — passed" : ""}
          </p>
        )}
      </header>

      {assignment.instructions && (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display font-semibold">Instructions</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.instructions}</p>

          {rubric.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">Marking rubric</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {rubric.map((item, index) => (
                  <li key={index}>
                    {item.criterion ?? `Criterion ${index + 1}`}
                    {item.points != null ? ` — ${item.points} points` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {graded && (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Graded</h2>
            <p className="font-display text-2xl font-bold text-success">
              {submission.grade}/{assignment.maxPoints}
            </p>
          </div>
          {submission.feedback && (
            <p className="mt-3 whitespace-pre-wrap text-sm">{submission.feedback}</p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-semibold">Your submission</h2>
          {submission && (
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {submission.status.replaceAll("_", " ").toLowerCase()}
              {submission.attemptNumber > 1 ? ` · attempt ${submission.attemptNumber}` : ""}
            </span>
          )}
        </div>

        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {files.map((file) => (
              <li key={file.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  {file.url ? (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium text-brand hover:underline"
                    >
                      {file.name}
                    </a>
                  ) : (
                    <span className="truncate text-sm">{file.name}</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {(file.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                </div>

                {!locked && submission && (
                  <form action={removeFileAction}>
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input type="hidden" name="key" value={file.key} />
                    <SubmitButton pendingLabel="Saving..."
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                    >
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {locked ? (
          <p className="mt-4 rounded-lg bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
            This work has been graded and can no longer be changed.
          </p>
        ) : (
          <form action={saveSubmissionAction} className="mt-4 space-y-4">
            <input type="hidden" name="assignmentId" value={assignment.id} />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Attach files</span>
              <input
                type="file"
                name="files"
                multiple
                accept={allowedTypes.map((t) => `.${t}`).join(",")}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Accepted: {allowedTypes.join(", ")} · up to {maxFileMb}MB each
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notes for your instructor</span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={submission?.notes ?? ""}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel="Saving..."
                name="intent"
                value="draft"
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
              >
                Save draft
              </SubmitButton>
              <SubmitButton pendingLabel="Saving..."
                name="intent"
                value="submit"
                disabled={pastDue && !assignment.allowResubmission}
                title={
                  pastDue && !assignment.allowResubmission
                    ? "The deadline has passed"
                    : undefined
                }
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {submission?.submittedAt ? "Resubmit" : "Submit"}
              </SubmitButton>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
