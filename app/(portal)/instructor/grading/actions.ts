"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { gradeSubmission } from "@/lib/assignments";

/** Grading (PRD §10.4). Ownership is re-checked inside gradeSubmission. */
export async function gradeSubmissionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const permitted =
    user.roles.includes("INSTRUCTOR") ||
    user.roles.includes("ADMIN") ||
    user.roles.includes("SUPER_ADMIN");
  if (!permitted) throw new Error("Instructor access required.");

  const result = await gradeSubmission(String(formData.get("submissionId") ?? ""), user.id, user.roles, {
    grade: Number(formData.get("grade")),
    feedback: String(formData.get("feedback") ?? ""),
  });

  if (!result.ok) {
    throw new Error(
      result.error === "NOT_FOUND"
        ? "That submission is not available to you."
        : `Could not grade: ${result.detail ?? result.error}`,
    );
  }

  revalidatePath("/instructor/grading");
  revalidatePath("/instructor");
}
