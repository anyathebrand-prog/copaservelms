import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";

/**
 * Course discussions (PRD §14).
 *
 * Two rules shape access:
 *
 * - A discussion belongs to its course. Only enrolled learners and the course's
 *   instructor can read or post, so "not enrolled" and "no such thread" are the
 *   same answer — whether a conversation exists inside a course you cannot see
 *   is not something an outsider should learn.
 * - Deletion is soft. A thread with a removed reply still makes sense; one with
 *   a hole in it does not, and moderation should be reversible.
 */

export type DiscussionError =
  | "NOT_FOUND"
  | "NOT_ENROLLED"
  | "LOCKED"
  | "FORBIDDEN"
  | "INVALID";

export type Result<T> = { ok: true; data: T } | { ok: false; error: DiscussionError };

const MAX_BODY = 5000;

function isAdmin(roles: string[]): boolean {
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

/** Can this person take part in this course's discussion, and can they moderate? */
async function participation(courseId: string, userId: string, roles: string[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, instructorId: true },
  });
  if (!course) return null;

  const moderator = course.instructorId === userId || isAdmin(roles);

  if (!moderator) {
    const enrolment = await prisma.enrollment.findFirst({
      where: { courseId, userId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { id: true },
    });
    if (!enrolment) return null;
  }

  return { course, moderator };
}

export async function listPosts(courseId: string, userId: string, roles: string[]) {
  const access = await participation(courseId, userId, roles);
  if (!access) return null;

  const posts = await prisma.discussionPost.findMany({
    where: { courseId, deletedAt: null },
    // Pinned first, then most recently active — an announcement should not
    // sink below chatter.
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, title: true, body: true, isPinned: true, isAnnouncement: true,
      isLocked: true, likeCount: true, createdAt: true,
      author: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      _count: { select: { comments: { where: { deletedAt: null } } } },
      likes: { where: { userId }, select: { id: true } },
    },
  });

  return {
    moderator: access.moderator,
    course: access.course,
    posts: posts.map((post) => ({
      ...post,
      authorName: displayName(post.author),
      isOwn: post.author.id === userId,
      likedByMe: post.likes.length > 0,
      replyCount: post._count.comments,
    })),
  };
}

export async function getPost(postId: string, userId: string, roles: string[]) {
  const post = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: {
      id: true, courseId: true, title: true, body: true, isPinned: true,
      isAnnouncement: true, isLocked: true, likeCount: true, createdAt: true, deletedAt: true,
      author: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      likes: { where: { userId }, select: { id: true } },
      course: { select: { title: true, slug: true } },
    },
  });

  if (!post || post.deletedAt !== null) return null;

  const access = await participation(post.courseId, userId, roles);
  if (!access) return null;

  const comments = await prisma.comment.findMany({
    where: { postId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, body: true, parentId: true, likeCount: true, createdAt: true,
      author: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      likes: { where: { userId }, select: { id: true } },
    },
  });

  return {
    post: {
      ...post,
      authorName: displayName(post.author),
      isOwn: post.author.id === userId,
      likedByMe: post.likes.length > 0,
    },
    moderator: access.moderator,
    comments: comments.map((comment) => ({
      ...comment,
      authorName: displayName(comment.author),
      isOwn: comment.author.id === userId,
      likedByMe: comment.likes.length > 0,
    })),
  };
}

export async function createPost(
  courseId: string,
  userId: string,
  roles: string[],
  input: { title?: string | null; body: string; isAnnouncement?: boolean },
): Promise<Result<{ id: string }>> {
  const access = await participation(courseId, userId, roles);
  if (!access) return { ok: false, error: "NOT_ENROLLED" };

  const body = input.body.trim();
  if (!body || body.length > MAX_BODY) return { ok: false, error: "INVALID" };

  // Announcements carry instructor authority, so only a moderator may make one.
  const isAnnouncement = Boolean(input.isAnnouncement) && access.moderator;

  const post = await prisma.discussionPost.create({
    data: {
      courseId,
      authorId: userId,
      title: input.title?.trim() || null,
      body,
      isAnnouncement,
      isPinned: isAnnouncement,
    },
    select: { id: true },
  });

  if (isAnnouncement) {
    // An announcement is course business, not marketing, so it reaches
    // everyone enrolled regardless of marketing consent.
    const enrolments = await prisma.enrollment.findMany({
      where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { userId: true },
    });

    for (const enrolment of enrolments) {
      if (enrolment.userId === userId) continue;
      await sendNotification({
        userId: enrolment.userId,
        kind: "course.approved",
        title: `Announcement in ${access.course.title}`,
        body: input.title?.trim() || body.slice(0, 200),
        actionUrl: `/student/discussions/${post.id}`,
        channels: ["EMAIL"],
      }).catch(() => {});
    }
  }

  return { ok: true, data: post };
}

export async function addComment(
  postId: string,
  userId: string,
  roles: string[],
  input: { body: string; parentId?: string | null },
): Promise<Result<{ id: string }>> {
  const post = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: { id: true, courseId: true, isLocked: true, deletedAt: true, authorId: true, title: true },
  });
  if (!post || post.deletedAt !== null) return { ok: false, error: "NOT_FOUND" };

  const access = await participation(post.courseId, userId, roles);
  if (!access) return { ok: false, error: "NOT_ENROLLED" };

  // A locked thread is closed to everyone but a moderator, which is the point
  // of locking it.
  if (post.isLocked && !access.moderator) return { ok: false, error: "LOCKED" };

  const body = input.body.trim();
  if (!body || body.length > MAX_BODY) return { ok: false, error: "INVALID" };

  // A reply must belong to the thread it claims to, or a comment could be
  // grafted onto a conversation its parent is not part of.
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { postId: true, deletedAt: true },
    });
    if (!parent || parent.postId !== postId || parent.deletedAt !== null) {
      return { ok: false, error: "INVALID" };
    }
  }

  const comment = await prisma.comment.create({
    data: { postId, authorId: userId, body, parentId: input.parentId || null },
    select: { id: true },
  });

  // Tell the thread author someone replied, unless they replied to themselves.
  if (post.authorId !== userId) {
    await sendNotification({
      userId: post.authorId,
      kind: "assignment.graded",
      title: `New reply in ${post.title ?? "your discussion"}`,
      body: body.slice(0, 200),
      actionUrl: `/student/discussions/${postId}`,
    }).catch(() => {});
  }

  return { ok: true, data: comment };
}

/**
 * Toggle a like.
 *
 * The row is the record and the counter is derived from it, so the count can
 * be repaired by recounting and a double-click cannot inflate it.
 */
export async function toggleLike(
  target: { postId?: string; commentId?: string },
  userId: string,
  roles: string[],
): Promise<Result<{ liked: boolean; likeCount: number }>> {
  const postId = target.postId ?? null;
  const commentId = target.commentId ?? null;
  if (!postId && !commentId) return { ok: false, error: "INVALID" };

  const courseId = postId
    ? (await prisma.discussionPost.findUnique({ where: { id: postId }, select: { courseId: true } }))?.courseId
    : (
        await prisma.comment.findUnique({
          where: { id: commentId! },
          select: { post: { select: { courseId: true } } },
        })
      )?.post?.courseId;

  if (!courseId) return { ok: false, error: "NOT_FOUND" };

  const access = await participation(courseId, userId, roles);
  if (!access) return { ok: false, error: "NOT_ENROLLED" };

  const existing = await prisma.discussionLike.findFirst({
    where: { userId, postId, commentId },
    select: { id: true },
  });

  if (existing) {
    await prisma.discussionLike.delete({ where: { id: existing.id } });
  } else {
    try {
      await prisma.discussionLike.create({ data: { userId, postId, commentId } });
    } catch (error) {
      // A concurrent double-click lost the race; the like already exists.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  // Recount rather than increment, so the counter cannot drift.
  const likeCount = await prisma.discussionLike.count({ where: { postId, commentId } });

  if (postId) {
    await prisma.discussionPost.update({ where: { id: postId }, data: { likeCount } });
  } else {
    await prisma.comment.update({ where: { id: commentId! }, data: { likeCount } });
  }

  return { ok: true, data: { liked: !existing, likeCount } };
}

// ---------------------------------------------------------------------------
// Moderation (§14)
// ---------------------------------------------------------------------------

export async function moderatePost(
  postId: string,
  userId: string,
  roles: string[],
  action: "pin" | "unpin" | "lock" | "unlock" | "delete",
): Promise<Result<{ courseId: string }>> {
  const post = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: { id: true, courseId: true, authorId: true },
  });
  if (!post) return { ok: false, error: "NOT_FOUND" };

  const access = await participation(post.courseId, userId, roles);
  if (!access) return { ok: false, error: "NOT_FOUND" };

  // An author may delete their own post; everything else needs a moderator.
  const allowed = action === "delete" ? access.moderator || post.authorId === userId : access.moderator;
  if (!allowed) return { ok: false, error: "FORBIDDEN" };

  await prisma.discussionPost.update({
    where: { id: postId },
    data:
      action === "pin" ? { isPinned: true }
      : action === "unpin" ? { isPinned: false }
      : action === "lock" ? { isLocked: true }
      : action === "unlock" ? { isLocked: false }
      : { deletedAt: new Date() },
  });

  return { ok: true, data: { courseId: post.courseId } };
}

export async function deleteComment(
  commentId: string,
  userId: string,
  roles: string[],
): Promise<Result<{ postId: string | null }>> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, postId: true, post: { select: { courseId: true } } },
  });
  if (!comment?.post) return { ok: false, error: "NOT_FOUND" };

  const access = await participation(comment.post.courseId, userId, roles);
  if (!access) return { ok: false, error: "NOT_FOUND" };

  if (!access.moderator && comment.authorId !== userId) return { ok: false, error: "FORBIDDEN" };

  // Soft delete keeps replies to this comment coherent.
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });

  return { ok: true, data: { postId: comment.postId } };
}

function displayName(author: {
  email: string;
  profile: { firstName: string; lastName: string } | null;
}): string {
  return `${author.profile?.firstName ?? ""} ${author.profile?.lastName ?? ""}`.trim() || author.email;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
