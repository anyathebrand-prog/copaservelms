import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Award, BookOpen, ClipboardCheck, FileText, Flame } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getDashboardSummary, getEnrolledCourses } from "@/lib/student";
import { StatCard } from "@/components/student/stat-card";
import { ProgressBar } from "@/components/student/progress-bar";
import { EmptyState, HeroFigure, HeroMetric, Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Student dashboard (PRD §9.1).
 *
 * Ordered by what a learner came for. The first thing is the course they were
 * in the middle of — nobody signs in to read their own statistics — so
 * "continue learning" leads and the figures support it.
 */
export default async function StudentDashboard() {
  const user = await requireRole(["STUDENT", "INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/student");
  const [summary, courses] = await Promise.all([
    getDashboardSummary(user.id),
    getEnrolledCourses(user.id),
  ]);

  const inProgress = courses.filter((course) => course.status === "ACTIVE");
  const next = inProgress[0];

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting()}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          {next
            ? "Pick up where you left off."
            : "Nothing in progress — find a course to start."}
        </p>
      </header>

      {/* The one thing worth doing right now, given the whole width. */}
      {next ? (
        <Link
          href={`/student/courses/${next.slug}`}
          className="group hero-ink grain relative block overflow-hidden rounded-3xl p-7 text-white transition hover:brightness-110"
        >
          <div
            aria-hidden
            className="absolute -right-20 -top-20 size-64 rounded-full bg-brand-bright/15 blur-3xl"
          />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-bright">
              Continue learning
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">
              {next.title}
            </h2>
            <p className="mt-2 text-sm text-white/50">
              {next.lessonsCompleted}/{next.lessonsTotal} lessons
              {next.estimatedMinutesRemaining
                ? ` · about ${next.estimatedMinutesRemaining} min left`
                : ""}
            </p>

            <div className="mt-6 flex items-center gap-4">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-brand-bright shadow-[0_0_12px_rgba(5,255,18,0.7)] transition-[width] duration-1000"
                  style={{ width: `${next.progressPercent}%` }}
                />
              </div>
              <span className="font-display text-lg font-bold">{next.progressPercent}%</span>
              <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      ) : (
        <HeroMetric
          eyebrow="Overall progress"
          value={`${summary.overallProgress}%`}
          caption="Across everything you are enrolled in."
        >
          <dl className="grid grid-cols-3 gap-4">
            <HeroFigure label="Day streak" value={summary.currentStreak} />
            <HeroFigure label="Hours" value={Math.round(summary.learningMinutes / 60)} />
            <HeroFigure label="XP" value={summary.xpPoints} />
          </dl>
        </HeroMetric>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Active courses" value={summary.activeCourses} />
        <StatCard icon={Award} label="Completed" value={summary.completedCourses} />
        <StatCard
          icon={FileText}
          label="Assignments due"
          value={summary.assignmentsDue}
          tone="alert"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Quiz average"
          value={summary.quizAverage === null ? "—" : `${summary.quizAverage}%`}
          hint={summary.quizAverage === null ? "No graded quizzes yet" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="In progress"
          action={{ href: "/student/courses", label: "All courses" }}
          className="lg:col-span-2"
        >
          {inProgress.length === 0 ? (
            <EmptyState>
              You have no courses in progress.{" "}
              <Link href="/courses" className="font-medium text-brand hover:underline">
                Browse the catalogue
              </Link>
              .
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {inProgress.slice(0, 4).map((course) => (
                <li key={course.enrollmentId} className="group py-4 first:pt-0 last:pb-0">
                  <Link href={`/student/courses/${course.slug}`} className="block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium transition group-hover:text-brand">
                          {course.title}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {course.lessonsCompleted}/{course.lessonsTotal} lessons
                          {course.estimatedMinutesRemaining
                            ? ` · ~${course.estimatedMinutesRemaining} min left`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-sm font-bold">
                        {course.progressPercent}%
                      </span>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={course.progressPercent} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Momentum">
            <dl className="space-y-4">
              <Figure
                icon={Flame}
                label="Day streak"
                value={summary.currentStreak}
                hint={summary.currentStreak === 0 ? "Study today to start one" : undefined}
              />
              <Figure label="Hours learned" value={Math.round(summary.learningMinutes / 60)} />
              <Figure label="XP earned" value={summary.xpPoints} />
              <Figure label="Certificates" value={summary.certificatesEarned} />
            </dl>
          </Panel>

          <Panel title="Badges" action={{ href: "/student/achievements", label: "All" }}>
            {summary.achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Badges you earn will appear here.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {summary.achievements.map((achievement) => (
                  <li
                    key={achievement.id}
                    className="rounded-full bg-brand-pale px-3.5 py-1.5 text-xs font-semibold text-brand"
                  >
                    {achievement.name}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon?: typeof Flame;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4 text-muted-foreground/70" />}
        {label}
        {hint && <span className="text-xs text-muted-foreground/70">· {hint}</span>}
      </dt>
      <dd className="font-display text-lg font-bold">{value}</dd>
    </div>
  );
}

/**
 * Time-of-day greeting, in Lagos time.
 *
 * The server may be anywhere; the learner is in Nigeria, and "Good evening" at
 * their breakfast is the kind of small wrongness that makes software feel like
 * it was built for somewhere else.
 */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
