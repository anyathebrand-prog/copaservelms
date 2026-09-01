import Link from "next/link";
import type { Metadata } from "next";
import { Award, BookOpen, ClipboardCheck, PenSquare, Plus, Users } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getInstructorCourses, getInstructorOverview } from "@/lib/instructor";
import { StatCard } from "@/components/student/stat-card";
import { StatusBadge } from "@/components/instructor/status-badge";
import { EmptyState, HeroFigure, HeroMetric, Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Instructor" };

/**
 * Instructor overview (PRD §10.1) and course list.
 *
 * Reach leads. An instructor's first question is how many people they are
 * teaching and whether those people are finishing, so students and completion
 * carry the weight; the rest are supporting counts. Pending submissions is
 * called out separately because it is the only figure here that is a task
 * rather than a fact.
 */
export default async function InstructorDashboard() {
  const user = await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor");
  const [overview, courses] = await Promise.all([
    getInstructorOverview(user.id),
    getInstructorCourses(user.id),
  ]);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Teaching</h1>
          <p className="mt-1.5 text-muted-foreground">Your courses and how they are performing.</p>
        </div>
        <Link
          href="/instructor/courses/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Plus className="size-4" />
          New course
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <HeroMetric
          eyebrow="Students reached"
          value={overview.students}
          caption={
            overview.students === 0
              ? "Nobody is enrolled yet."
              : `Across ${overview.courses} course${overview.courses === 1 ? "" : "s"}.`
          }
        >
          <dl className="grid grid-cols-3 gap-4">
            <HeroFigure
              label="Completion"
              value={overview.completionRate === null ? "—" : `${overview.completionRate}%`}
            />
            <HeroFigure
              label="Avg quiz"
              value={overview.averageQuizScore === null ? "—" : `${overview.averageQuizScore}%`}
            />
            <HeroFigure label="Certificates" value={overview.certificatesIssued} />
          </dl>
        </HeroMetric>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard icon={BookOpen} label="Courses" value={overview.courses} />
          <StatCard icon={Users} label="Students" value={overview.students} />
          <StatCard
            icon={PenSquare}
            label="Awaiting grading"
            value={overview.pendingSubmissions}
            tone="alert"
            hint={overview.pendingSubmissions > 0 ? "Students are waiting" : undefined}
          />
          <StatCard
            icon={ClipboardCheck}
            label="Average quiz score"
            value={overview.averageQuizScore === null ? "—" : `${overview.averageQuizScore}%`}
          />
        </div>
      </div>

      {overview.pendingSubmissions > 0 && (
        <Link
          href="/instructor/grading"
          className="flex items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning/5 px-6 py-5 transition hover:border-warning/50"
        >
          <div>
            <p className="font-medium text-warning">
              {overview.pendingSubmissions} submission
              {overview.pendingSubmissions === 1 ? "" : "s"} waiting to be graded
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Nobody can complete a course while their work is unmarked.
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-white">
            Grade now
          </span>
        </Link>
      )}

      <Panel title="Your courses">
        {courses.length === 0 ? (
          <EmptyState>
            You have not created a course yet.{" "}
            <Link href="/instructor/courses/new" className="font-medium text-brand hover:underline">
              Create your first one
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {courses.map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/instructor/courses/${course.id}`}
                      className="font-medium transition hover:text-brand"
                    >
                      {course.title}
                    </Link>
                    <StatusBadge status={course.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    <span>{course.category?.name ?? "Uncategorised"}</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3.5" />
                      {course._count.modules} modules
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      {course._count.enrollments} enrolled
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
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
      </Panel>

      {overview.certificatesIssued > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Award className="size-4 text-brand" />
          {overview.certificatesIssued} certificate
          {overview.certificatesIssued === 1 ? " has" : "s have"} been issued from your courses.
        </p>
      )}
    </div>
  );
}
