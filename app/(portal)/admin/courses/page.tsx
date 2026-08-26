import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getCourseQueue } from "@/lib/admin";
import { StatusBadge } from "@/components/instructor/status-badge";
import { reviewCourseAction } from "../actions";
import type { CourseStatus } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "Course management" };

const FILTERS: { id: CourseStatus | "ALL"; label: string }[] = [
  { id: "SUBMITTED", label: "Awaiting review" },
  { id: "APPROVED", label: "Approved" },
  { id: "PUBLISHED", label: "Live" },
  { id: "DRAFT", label: "Drafts" },
  { id: "ALL", label: "All" },
];

/** Course approval queue (PRD §13.2). */
export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/courses");
  const { status = "SUBMITTED" } = await searchParams;
  const courses = await getCourseQueue(status as CourseStatus | "ALL");

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Course management</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={`/admin/courses?status=${filter.id}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              status === filter.id ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {courses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No courses in this state.
        </p>
      ) : (
        <ul className="space-y-4">
          {courses.map((course) => (
            <li key={course.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-semibold">{course.title}</h2>
                    <StatusBadge status={course.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.instructor.profile?.firstName} {course.instructor.profile?.lastName} (
                    {course.instructor.email}) · {course.category?.name ?? "Uncategorised"} ·{" "}
                    {course._count.modules} modules · {course._count.enrollments} enrolled
                  </p>
                  {course.submittedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Submitted {course.submittedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    </p>
                  )}
                </div>

                <Link
                  href={`/instructor/courses/${course.id}`}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                >
                  Inspect
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                {(course.status === "SUBMITTED" || course.status === "APPROVED") && (
                  <>
                    {course.status === "SUBMITTED" && (
                      <Decision courseId={course.id} decision="APPROVE" label="Approve" tone="secondary" />
                    )}
                    <Decision courseId={course.id} decision="PUBLISH" label="Publish" tone="primary" />
                  </>
                )}

                {course.status === "PUBLISHED" && (
                  <Decision courseId={course.id} decision="ARCHIVE" label="Archive" tone="secondary" />
                )}

                {course.status === "SUBMITTED" && (
                  // A rejection must carry a reason: it is recorded in the audit
                  // log and is the only thing the instructor has to act on.
                  <form action={reviewCourseAction} className="flex flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="decision" value="REJECT" />
                    <label className="min-w-48 flex-1">
                      <span className="mb-1.5 block text-sm font-medium">Rejection reason</span>
                      <input
                        name="reason"
                        required
                        placeholder="What needs to change before resubmission?"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
                    >
                      Reject to draft
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Decision({
  courseId,
  decision,
  label,
  tone,
}: {
  courseId: string;
  decision: string;
  label: string;
  tone: "primary" | "secondary";
}) {
  return (
    <form action={reviewCourseAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        className={
          tone === "primary"
            ? "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            : "rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
        }
      >
        {label}
      </button>
    </form>
  );
}
