"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  addComment,
  createPost,
  deleteComment,
  moderatePost,
  toggleLike,
  type DiscussionError,
} from "@/lib/discussions";

/**
 * Discussion actions (PRD §14).
 *
 * Every one re-derives the actor from the session and re-checks course access
 * inside lib/discussions — a post id in a form is not proof of membership.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function explode(error: DiscussionError): never {
  const messages: Record<DiscussionError, string> = {
    NOT_FOUND: "That discussion is not available to you.",
    NOT_ENROLLED: "That discussion is not available to you.",
    LOCKED: "This thread is locked.",
    FORBIDDEN: "You cannot do that.",
    INVALID: "Write something first — and keep it under 5000 characters.",
  };
  throw new Error(messages[error]);
}

export async function createPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");

  const result = await createPost(String(formData.get("courseId") ?? ""), user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    isAnnouncement: formData.get("isAnnouncement") === "on",
  });

  if (!result.ok) explode(result.error);

  revalidatePath(`/student/courses/${slug}/discussions`);
  redirect(`/student/discussions/${result.data.id}`);
}

export async function addCommentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const postId = String(formData.get("postId") ?? "");

  const result = await addComment(postId, user.id, user.roles, {
    body: String(formData.get("body") ?? ""),
    parentId: (formData.get("parentId") as string) || null,
  });

  if (!result.ok) explode(result.error);
  revalidatePath(`/student/discussions/${postId}`);
}

export async function toggleLikeAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const result = await toggleLike(
    {
      postId: (formData.get("postId") as string) || undefined,
      commentId: (formData.get("commentId") as string) || undefined,
    },
    user.id,
    user.roles,
  );

  if (!result.ok) explode(result.error);
  revalidatePath(`/student/discussions/${String(formData.get("threadId") ?? "")}`);
}

export async function moderateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const action = String(formData.get("action") ?? "") as "pin" | "unpin" | "lock" | "unlock" | "delete";

  const result = await moderatePost(postId, user.id, user.roles, action);
  if (!result.ok) explode(result.error);

  revalidatePath(`/student/discussions/${postId}`);
  revalidatePath("/student/courses");

  // A deleted thread has nowhere to return to.
  if (action === "delete") redirect(`/student/courses/${String(formData.get("slug") ?? "")}/discussions`);
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const result = await deleteComment(String(formData.get("commentId") ?? ""), user.id, user.roles);
  if (!result.ok) explode(result.error);

  revalidatePath(`/student/discussions/${result.data.postId ?? ""}`);
}
