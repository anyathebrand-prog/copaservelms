import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getCourseForPlayer } from "@/lib/student";
import { ProgressBar } from "@/components/student/progress-bar";

export const metadata: Metadata = { title: "Course" };

/**
 * Course overview — the curriculum, and the entry point into the player.
 *
 * A non-enrolled user gets a 404 rather than a redirect: whether a course
 * exists behind this URL is not something the page should confirm.
 */
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/student/courses/${slug}`);
  const data = await getCourseForPlayer(user.id, slug);

  if (!data) notFound();

  const lessons = data.modules.flatMap((module) => module.lessons);
  const nextLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];

  return (
    <div className="space-y-8">
      <header>
        <Link href="/student/courses" className="text-sm text-muted-foreground hover:text-foreground">
          ← My Courses
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{data.course.title}</h1>
        {data.course.description && (
          <p className="mt-2 max-w-2xl text-muted-foreground">{data.course.description}</p>
        )}

        <div className="mt-6 max-w-md space-y-2">
          <ProgressBar value={data.progressPercent} />
          <p className="text-sm text-muted-foreground">
            {lessons.filter((l) => l.completed).length} of {lessons.length} lessons complete
          </p>
        </div>

        {nextLesson && (
          <Link
            href={`/student/courses/${slug}/lessons/${nextLesson.id}`}
            className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {data.progressPercent > 0 ? "Continue Learning" : "Start Course"}
          </Link>
        )}
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Curriculum</h2>

        {data.modules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            This course has no published lessons yet.
          </p>
        ) : (
          data.modules.map((module) => (
            <article key={module.id} className="rounded-2xl border border-border bg-surface">
              <header className="border-b border-border px-5 py-4">
                <h3 className="font-medium">
                  <span className="text-muted-foreground">{module.position}.</span> {module.title}
                </h3>
              </header>
              <ul className="divide-y divide-border">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/student/courses/${slug}/lessons/${lesson.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-surface-muted"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                            lesson.completed
                              ? "border-success bg-success text-white"
                              : "border-border text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="truncate text-sm">{lesson.title}</span>
                      </span>
                      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                        {lesson.durationSeconds
                          ? `${Math.round(lesson.durationSeconds / 60)} min`
                          : lesson.type.toLowerCase()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
