import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getPost } from "@/lib/discussions";
import {
  addCommentAction,
  deleteCommentAction,
  moderateAction,
  toggleLikeAction,
} from "../actions";

export const metadata: Metadata = { title: "Thread" };
export const dynamic = "force-dynamic";

/** One thread with its replies (PRD §14). */
export default async function ThreadPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const user = await requireUser(`/student/discussions/${postId}`);

  const data = await getPost(postId, user.id, user.roles);
  if (!data) notFound();

  const { post, comments, moderator } = data;

  // Replies are stored flat with a parentId; nest one level for display.
  const topLevel = comments.filter((comment) => comment.parentId === null);
  const repliesByParent = new Map<string, typeof comments>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const list = repliesByParent.get(comment.parentId) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parentId, list);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/student/courses/${post.course.slug}/discussions`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {post.course.title} discussion
        </Link>
      </header>

      <article className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {post.title && <h1 className="font-display text-2xl font-bold tracking-tight">{post.title}</h1>}
              {post.isAnnouncement && (
                <span className="rounded-full bg-brand-pale px-2.5 py-0.5 text-xs font-semibold text-brand">
                  announcement
                </span>
              )}
              {post.isLocked && (
                <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  locked
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {post.authorName} ·{" "}
              {post.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap">{post.body}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <form action={toggleLikeAction}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="threadId" value={post.id} />
            <button
              type="submit"
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                post.likedByMe
                  ? "border-brand bg-brand-pale text-brand"
                  : "border-border hover:bg-surface-muted"
              }`}
            >
              {post.likedByMe ? "Liked" : "Like"} · {post.likeCount}
            </button>
          </form>

          {moderator && (
            <>
              <ModerateButton postId={post.id} action={post.isPinned ? "unpin" : "pin"}
                label={post.isPinned ? "Unpin" : "Pin"} />
              <ModerateButton postId={post.id} action={post.isLocked ? "unlock" : "lock"}
                label={post.isLocked ? "Unlock" : "Lock"} />
            </>
          )}

          {(moderator || post.isOwn) && (
            <form action={moderateAction} className="ml-auto">
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="slug" value={post.course.slug} />
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                Delete thread
              </button>
            </form>
          )}
        </div>
      </article>

      <section>
        <h2 className="font-display text-xl font-semibold">
          {comments.length} repl{comments.length === 1 ? "y" : "ies"}
        </h2>

        <ul className="mt-4 space-y-3">
          {topLevel.map((comment) => (
            <li key={comment.id} className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-sm text-muted-foreground">
                {comment.authorName} ·{" "}
                {comment.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={toggleLikeAction}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input type="hidden" name="threadId" value={post.id} />
                  <button
                    type="submit"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      comment.likedByMe ? "bg-brand-pale text-brand" : "hover:bg-surface-muted"
                    }`}
                  >
                    {comment.likedByMe ? "Liked" : "Like"} · {comment.likeCount}
                  </button>
                </form>

                {(moderator || comment.isOwn) && (
                  <form action={deleteCommentAction}>
                    <input type="hidden" name="commentId" value={comment.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                    >
                      Delete
                    </button>
                  </form>
                )}
              </div>

              {(repliesByParent.get(comment.id) ?? []).length > 0 && (
                <ul className="mt-4 space-y-3 border-l-2 border-border pl-4">
                  {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                    <li key={reply.id}>
                      <p className="text-xs text-muted-foreground">
                        {reply.authorName} ·{" "}
                        {reply.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{reply.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              {!post.isLocked && (
                <form action={addCommentAction} className="mt-4 flex gap-2">
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="parentId" value={comment.id} />
                  <input
                    name="body"
                    required
                    maxLength={5000}
                    placeholder="Reply…"
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                  >
                    Reply
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {post.isLocked ? (
          <p className="mt-4 rounded-lg bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
            This thread is locked. {moderator ? "You can still reply as a moderator." : "No new replies."}
          </p>
        ) : null}

        {(!post.isLocked || moderator) && (
          <form action={addCommentAction} className="mt-4 space-y-3 rounded-2xl border border-border bg-surface p-5">
            <input type="hidden" name="postId" value={post.id} />
            <textarea
              name="body"
              required
              rows={3}
              maxLength={5000}
              placeholder="Add to the discussion"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Post reply
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function ModerateButton({
  postId,
  action,
  label,
}: {
  postId: string;
  action: string;
  label: string;
}) {
  return (
    <form action={moderateAction}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
      >
        {label}
      </button>
    </form>
  );
}
