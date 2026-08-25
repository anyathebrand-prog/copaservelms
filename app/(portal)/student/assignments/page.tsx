import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getStudentAssignments } from "@/lib/student";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const user = await requireUser("/student/assignments");
  const assignments = await getStudentAssignments(user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Assignments</h1>
      </header>

      {assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No assignments in your enrolled courses yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((assignment) => {
            const submission = assignment.submissions[0];
            const overdue =
              assignment.dueAt !== null && assignment.dueAt < new Date() && !submission?.submittedAt;

            return (
              <li key={assignment.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{assignment.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {assignment.course.title} · {assignment.maxPoints} points
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      submission?.status === "GRADED"
                        ? "bg-success/10 text-success"
                        : overdue
                          ? "bg-danger/10 text-danger"
                          : submission
                            ? "bg-brand-pale text-brand"
                            : "bg-warning/10 text-warning"
                    }`}
                  >
                    {submission
                      ? submission.status.replaceAll("_", " ").toLowerCase()
                      : overdue
                        ? "overdue"
                        : "not started"}
                  </span>
                </div>

                {assignment.dueAt && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Due {assignment.dueAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </p>
                )}

                {submission?.grade != null && (
                  <p className="mt-2 text-sm font-medium">
                    Grade: {submission.grade}/{assignment.maxPoints}
                  </p>
                )}
                {submission?.feedback && (
                  <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                    {submission.feedback}
                  </p>
                )}

                {/* Submission upload is intentionally absent: it needs the
                    storage abstraction (§6.2) before files can be accepted. */}
                <p className="mt-3 text-xs text-muted-foreground">
                  File submission opens once course storage is configured.
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
