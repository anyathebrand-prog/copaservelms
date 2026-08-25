import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getCourseForPlayer } from "@/lib/student";
import { ProgressBar } from "@/components/student/progress-bar";
import { completeLessonAction } from "../../actions";

export const metadata: Metadata = { title: "Lesson" };

/**
 * Course player (PRD §9.4).
 *
 * Video playback uses the native element with controls: playback speed and
 * Picture-in-Picture come free from the browser, and captions attach as track
 * elements once lessons carry caption files. A custom player is a later
 * refinement, not a prerequisite for learning.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const user = await requireUser(`/student/courses/${slug}/lessons/${lessonId}`);
  const data = await getCourseForPlayer(user.id, slug);

  if (!data) notFound();

  const lessons = data.modules.flatMap((module) => module.lessons);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);

  if (index === -1) notFound();

  const lesson = lessons[index];
  const previous = index > 0 ? lessons[index - 1] : null;
  const next = index < lessons.length - 1 ? lessons[index + 1] : null;
  const courseQuizzes = data.course.quizzes.filter((quiz) => quiz.lessonId === lesson.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <article className="min-w-0 space-y-6">
        <header>
          <Link
            href={`/student/courses/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← {data.course.title}
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{lesson.title}</h1>
        </header>

        {lesson.type === "VIDEO" && lesson.contentUrl ? (
          <video
            controls
            controlsList="nodownload"
            playsInline
            className="aspect-video w-full rounded-2xl bg-black"
            src={lesson.contentUrl}
          />
        ) : lesson.type === "PDF" && lesson.contentUrl ? (
          <iframe
            src={lesson.contentUrl}
            title={lesson.title}
            className="h-[70vh] w-full rounded-2xl border border-border"
          />
        ) : lesson.type === "AUDIO" && lesson.contentUrl ? (
          <audio controls className="w-full" src={lesson.contentUrl} />
        ) : lesson.contentUrl ? (
          <a
            href={lesson.contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Open resource ↗
          </a>
        ) : null}

        {lesson.content && (
          <div className="prose-sm max-w-none whitespace-pre-wrap rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed">
            {lesson.content}
          </div>
        )}

        {courseQuizzes.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display font-semibold">Check your understanding</h2>
            <ul className="mt-3 space-y-2">
              {courseQuizzes.map((quiz) => (
                <li key={quiz.id}>
                  <Link href={`/student/quizzes/${quiz.id}`} className="text-sm text-brand hover:underline">
                    {quiz.title} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <form action={completeLessonAction}>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              disabled={lesson.completed}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {lesson.completed ? "Completed ✓" : "Mark as complete"}
            </button>
          </form>

          <div className="ml-auto flex gap-2">
            {previous && (
              <Link
                href={`/student/courses/${slug}/lessons/${previous.id}`}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
              >
                ← Previous
              </Link>
            )}
            {next && (
              <Link
                href={`/student/courses/${slug}/lessons/${next.id}`}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
              >
                Next →
              </Link>
            )}
          </div>
        </footer>
      </article>

      {/* Persistent course progress sidebar (§9.4). */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-medium">Course progress</p>
          <div className="mt-3 space-y-2">
            <ProgressBar value={data.progressPercent} />
            <p className="text-xs text-muted-foreground">
              {lessons.filter((l) => l.completed).length}/{lessons.length} lessons
            </p>
          </div>

          <ol className="mt-5 max-h-[50vh] space-y-1 overflow-y-auto">
            {lessons.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/student/courses/${slug}/lessons/${item.id}`}
                  aria-current={item.id === lesson.id ? "page" : undefined}
                  className={`block truncate rounded-lg px-3 py-2 text-sm transition ${
                    item.id === lesson.id
                      ? "bg-brand-pale font-medium text-brand"
                      : "text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  {item.completed ? "✓ " : ""}
                  {item.title}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
