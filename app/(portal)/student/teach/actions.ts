"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  applyToTeach,
  withdrawApplication,
  type ApplicationError,
} from "@/lib/instructor-applications";

const MESSAGES: Record<ApplicationError, string> = {
  NOT_FOUND: "That application no longer exists.",
  INVALID: "Please check the form and try again.",
  ALREADY_INSTRUCTOR: "You already teach on CopaServe.",
  ALREADY_PENDING: "You already have an application with us. We will come back to you on that one.",
  NOT_PENDING: "That application has already been decided.",
  FORBIDDEN: "You cannot do that.",
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

export async function applyToTeachAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const result = await applyToTeach(user.id, {
    expertise: String(formData.get("expertise") ?? ""),
    background: String(formData.get("background") ?? ""),
    link: String(formData.get("link") ?? ""),
  });

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath("/student/teach");
  revalidatePath("/admin/instructors");
}

export async function withdrawApplicationAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const result = await withdrawApplication(String(formData.get("applicationId") ?? ""), user.id);
  if (!result.ok) throw new Error(MESSAGES[result.error]);

  revalidatePath("/student/teach");
  revalidatePath("/admin/instructors");
}
