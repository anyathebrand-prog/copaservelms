import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { listPosts } from "@/lib/discussions";
import { createPostAction } from "../../../discussions/actions";

export const metadata: Metadata = { title: "Discussion" };
export const dynamic = "force-dynamic";

/** Course discussion (PRD §14). */
export default async function CourseDiscussionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/student/courses/${slug}/discussions`);

  const course = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
  if (!course) notFound();

  const data = await listPosts(course.id, user.id, user.roles);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/student/courses/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {data.course.title}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Discussion</h1>
        <p className="mt-1 text-muted-foreground">
          {data.posts.length} thread{data.posts.length === 1 ? "" : "s"}
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display font-semibold">Start a thread</h2>
        <form action={createPostAction} className="mt-4 space-y-3">
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="slug" value={slug} />

          <input
            name="title"
            placeholder="Title (optional)"
            maxLength={200}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
          <textarea
            name="body"
            required
            rows={3}
            maxLength={5000}
            placeholder="Ask a question or share something with the group."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />

          <div className="flex flex-wrap items-center gap-4">
            {data.moderator && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isAnnouncement" className="accent-[var(--brand-green)]" />
                Post as an announcement (pinned, and emailed to everyone enrolled)
              </label>
            )}
            <button
              type="submit"
              className="ml-auto rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Post
            </button>
          </div>
        </form>
      </section>

      {data.posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No discussion yet. Be the first to ask something.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.posts.map((post) => (
            <li key={post.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/student/discussions/${post.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {post.title || post.body.slice(0, 80)}
                    </Link>
                    {post.isAnnouncement && (
                      <span className="rounded-full bg-brand-pale px-2.5 py-0.5 text-xs font-semibold text-brand">
                        announcement
                      </span>
                    )}
                    {post.isPinned && !post.isAnnouncement && (
                      <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        pinned
                      </span>
                    )}
                    {post.isLocked && (
                      <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                        locked
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {post.authorName} · {post.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })} ·{" "}
                    {post.replyCount} repl{post.replyCount === 1 ? "y" : "ies"} · {post.likeCount} like
                    {post.likeCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
