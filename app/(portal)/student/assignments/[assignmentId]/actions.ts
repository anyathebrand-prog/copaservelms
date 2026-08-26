"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { removeSubmissionFile, saveSubmission, type SubmissionError, type UploadInput } from "@/lib/assignments";

/**
 * Assignment submission actions (PRD §9.6).
 *
 * Files arrive as part of the Server Action's FormData. The submitter is taken
 * from the session, never the form, and every validation (type, size, deadline)
 * is re-applied server-side — the client-side `accept` attribute is a
 * convenience, not a control.
 */
function explode(error: SubmissionError, detail?: string): never {
  const messages: Record<SubmissionError, string> = {
    NOT_FOUND: "That assignment is not available to you.",
    NOT_ENROLLED: "That assignment is not available to you.",
    CLOSED: "The deadline has passed and this assignment does not accept resubmissions.",
    TOO_LARGE: "That file is too large.",
    BAD_TYPE: "That file type is not accepted for this assignment.",
    EMPTY: "Attach a file or write something before submitting.",
    ALREADY_GRADED: "This work has been graded and cannot be changed.",
  };
  throw new Error(detail ? `${messages[error]} — ${detail}` : messages[error]);
}

async function collectUploads(formData: FormData): Promise<UploadInput[]> {
  const uploads: UploadInput[] = [];

  for (const entry of formData.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    uploads.push({
      name: entry.name,
      bytes: new Uint8Array(await entry.arrayBuffer()),
      mimeType: entry.type,
    });
  }

  return uploads;
}

export async function saveSubmissionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const submit = formData.get("intent") === "submit";

  const result = await saveSubmission(assignmentId, user.id, {
    notes: String(formData.get("notes") ?? ""),
    uploads: await collectUploads(formData),
    submit,
  });

  if (!result.ok) explode(result.error, result.detail);

  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student/assignments");
  revalidatePath("/student");
}

export async function removeFileAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const result = await removeSubmissionFile(
    String(formData.get("submissionId") ?? ""),
    user.id,
    String(formData.get("key") ?? ""),
  );

  if (!result.ok) explode(result.error);

  revalidatePath(`/student/assignments/${String(formData.get("assignmentId") ?? "")}`);
}
