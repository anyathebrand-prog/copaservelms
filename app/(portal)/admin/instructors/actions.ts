"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  approveApplication,
  declineApplication,
  type ApplicationError,
} from "@/lib/instructor-applications";

const MESSAGES: Record<ApplicationError, string> = {
  NOT_FOUND: "That application no longer exists.",
  INVALID: "That is not valid.",
  ALREADY_INSTRUCTOR: "They already teach on CopaServe.",
  ALREADY_PENDING: "There is already an open application.",
  NOT_PENDING: "That application has already been decided.",
  FORBIDDEN: "You do not have permission to grant that role.",
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function approveApplicationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await approveApplication(
    String(formData.get("applicationId") ?? ""),
    user.id,
    user.roles,
    String(formData.get("note") ?? ""),
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath("/admin/instructors");
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function declineApplicationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await declineApplication(
    String(formData.get("applicationId") ?? ""),
    user.id,
    String(formData.get("note") ?? ""),
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath("/admin/instructors");
  revalidatePath("/admin");
}
