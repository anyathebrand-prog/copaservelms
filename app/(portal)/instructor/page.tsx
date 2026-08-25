import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getInstructorCourses, getInstructorOverview } from "@/lib/instructor";
import { StatCard } from "@/components/student/stat-card";
import { StatusBadge } from "@/components/instructor/status-badge";

export const metadata: Metadata = { title: "Instructor" };

/** Instructor overview (PRD §10.1) and course list. */
export default async function InstructorDashboard() {
  const user = await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor");
  const [overview, courses] = await Promise.all([
    getInstructorOverview(user.id),
    getInstructorCourses(user.id),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Instructor</h1>
          <p className="mt-1 text-muted-foreground">Your courses and how they are performing.</p>
        </div>
        <Link
          href="/instructor/courses/new"
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          New course
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Courses" value={overview.courses} />
        <StatCard label="Students" value={overview.students} />
        <StatCard
          label="Completion rate"
          value={overview.completionRate === null ? "—" : `${overview.completionRate}%`}
        />
        <StatCard
          label="Average quiz score"
          value={overview.averageQuizScore === null ? "—" : `${overview.averageQuizScore}%`}
        />
        <StatCard label="Pending submissions" value={overview.pendingSubmissions} />
        <StatCard label="Certificates issued" value={overview.certificatesIssued} />
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Courses</h2>

        {courses.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            You have not created a course yet.{" "}
            <Link href="/instructor/courses/new" className="font-medium text-brand hover:underline">
              Create your first one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {courses.map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/instructor/courses/${course.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {course.title}
                    </Link>
                    <StatusBadge status={course.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.category?.name ?? "Uncategorised"} · {course._count.modules} modules ·{" "}
                    {course._count.enrollments} enrolled
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/instructor/courses/${course.id}/students`}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                  >
                    Students
                  </Link>
                  <Link
                    href={`/instructor/courses/${course.id}`}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
