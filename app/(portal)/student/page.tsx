import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getDashboardSummary, getEnrolledCourses } from "@/lib/student";
import { StatCard } from "@/components/student/stat-card";
import { ProgressRing } from "@/components/student/progress-ring";
import { ProgressBar } from "@/components/student/progress-bar";

export const metadata: Metadata = { title: "Dashboard" };

/** Student dashboard (PRD §9.1). */
export default async function StudentDashboard() {
  const user = await requireRole(["STUDENT", "INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/student");
  const [summary, courses] = await Promise.all([
    getDashboardSummary(user.id),
    getEnrolledCourses(user.id),
  ]);

  const inProgress = courses.filter((course) => course.status === "ACTIVE").slice(0, 3);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Your learning at a glance.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active courses" value={summary.activeCourses} />
        <StatCard label="Completed" value={summary.completedCourses} />
        <StatCard label="Assignments due" value={summary.assignmentsDue} />
        <StatCard
          label="Quiz average"
          value={summary.quizAverage === null ? "—" : `${summary.quizAverage}%`}
          hint={summary.quizAverage === null ? "No graded quizzes yet" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-6 text-center">
          <h2 className="font-display font-semibold">Overall progress</h2>
          <div className="mt-4">
            <ProgressRing value={summary.overallProgress} />
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Streak</dt>
              <dd className="font-semibold">{summary.currentStreak}d</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hours</dt>
              <dd className="font-semibold">{Math.round(summary.learningMinutes / 60)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">XP</dt>
              <dd className="font-semibold">{summary.xpPoints}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Continue learning</h2>
            <Link href="/student/courses" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>

          {inProgress.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              You have no courses in progress yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {inProgress.map((course) => (
                <li key={course.enrollmentId} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/student/courses/${course.slug}`} className="font-medium hover:text-brand">
                        {course.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {course.lessonsCompleted}/{course.lessonsTotal} lessons
                        {course.estimatedMinutesRemaining
                          ? ` · ~${course.estimatedMinutesRemaining} min left`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{course.progressPercent}%</span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={course.progressPercent} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display font-semibold">Achievements</h2>
        {summary.achievements.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Badges you earn will appear here. Certificates earned: {summary.certificatesEarned}.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-3">
            {summary.achievements.map((achievement) => (
              <li
                key={achievement.id}
                className="rounded-full bg-brand-pale px-4 py-1.5 text-sm font-medium text-brand"
              >
                {achievement.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
