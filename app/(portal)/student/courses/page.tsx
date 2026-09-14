import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getEnrolledCourses } from "@/lib/student";
import { ProgressBar } from "@/components/student/progress-bar";
import { CourseCover } from "@/components/course/course-cover";

export const metadata: Metadata = { title: "My Courses" };

const TABS = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

/**
 * My Courses (PRD §9.3).
 *
 * Filters are URL params rather than client state, so the list is
 * server-rendered, shareable, and works without JavaScript.
 */
export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const user = await requireUser("/student/courses");
  const { filter = "all", q = "" } = await searchParams;
  const courses = await getEnrolledCourses(user.id);

  const filtered = courses.filter((course) => {
    const matchesFilter =
      filter === "completed"
        ? course.status === "COMPLETED"
        : filter === "in-progress"
          ? course.status === "ACTIVE"
          : true;
    const matchesQuery = q
      ? course.title.toLowerCase().includes(q.toLowerCase()) ||
        (course.categoryName ?? "").toLowerCase().includes(q.toLowerCase())
      : true;
    return matchesFilter && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">My Courses</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/student/courses?filter=${tab.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === tab.id ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}

        <form className="ml-auto" action="/student/courses">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search courses"
            aria-label="Search courses"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {courses.length === 0
            ? "You are not enrolled in any courses yet."
            : "No courses match this filter."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((course) => (
            <article
              key={course.enrollmentId}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <CourseCover
                title={course.title}
                slug={course.slug}
                thumbnailUrl={course.thumbnailUrl}
                category={course.categoryName}
                sizes="(min-width: 640px) 50vw, 100vw"
              />

              <div className="p-5">
              {course.categoryName && (
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  {course.categoryName}
                </p>
              )}
              <h2 className="mt-1 font-display text-lg font-semibold">{course.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{course.instructorName}</p>

              <div className="mt-4 space-y-2">
                <ProgressBar value={course.progressPercent} />
                <p className="text-xs text-muted-foreground">
                  {course.lessonsCompleted}/{course.lessonsTotal} lessons
                  {course.estimatedMinutesRemaining
                    ? ` · ~${course.estimatedMinutesRemaining} min left`
                    : ""}
                </p>
              </div>

              {/* A course at 100% is not something to "continue". Saying so is
                  also the honest label for the state: the lessons are done,
                  whatever remains is the assessment. */}
              <Link
                href={`/student/courses/${course.slug}`}
                className={`mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  course.progressPercent >= 100
                    ? "border border-brand/30 bg-brand-pale text-brand hover:bg-brand-pale/70"
                    : "bg-brand text-white hover:brightness-110"
                }`}
              >
                {course.progressPercent >= 100
                  ? "Completed"
                  : course.progressPercent > 0
                    ? "Continue Learning"
                    : "Start Course"}
              </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
