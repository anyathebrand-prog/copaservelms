"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { auditEntry, isAdmin, reviewCourse, setUserRole, setUserStatus, type AdminError } from "@/lib/admin";
import type { RoleName, UserStatus } from "@/app/generated/prisma/enums";

/**
 * Admin Server Actions.
 *
 * The actor is re-derived from the session on every call — a Server Action is a
 * public endpoint, and an actorId taken from the form would let anyone attribute
 * an action to someone else in the audit log.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

function explode(error: AdminError): never {
  const messages: Record<AdminError, string> = {
    NOT_FOUND: "That record no longer exists.",
    FORBIDDEN: "You do not have permission for that action.",
    INVALID: "That input is not valid — a rejection needs a reason.",
    SELF_TARGET: "You cannot apply that action to your own account.",
    LAST_SUPER_ADMIN: "This is the last active Super Admin; the platform would be left without one.",
  };
  throw new Error(messages[error]);
}

export async function reviewCourseAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await reviewCourse(
    user.id,
    user.roles,
    String(formData.get("courseId") ?? ""),
    String(formData.get("decision") ?? "") as "APPROVE" | "PUBLISH" | "REJECT" | "ARCHIVE",
    String(formData.get("reason") ?? ""),
  );

  if (!result.ok) explode(result.error);

  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  // The catalogue and landing page both key off published courses.
  revalidatePath("/");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await setUserStatus(
    user.id,
    user.roles,
    String(formData.get("userId") ?? ""),
    String(formData.get("status") ?? "") as UserStatus,
  );

  if (!result.ok) explode(result.error);

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await setUserRole(
    user.id,
    user.roles,
    String(formData.get("userId") ?? ""),
    String(formData.get("role") ?? "") as RoleName,
    formData.get("grant") === "true",
  );

  if (!result.ok) explode(result.error);

  revalidatePath("/admin/users");
}

/**
 * Record an admin data export (§12.3).
 *
 * Exports are themselves a processing activity under the NDPA, so the act of
 * exporting is logged even though it changes nothing.
 */
export async function logExportAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const requestHeaders = await headers();

  await auditEntry({
    actorId: user.id,
    action: "admin.export",
    entityType: String(formData.get("entityType") ?? "Unknown"),
    entityId: (formData.get("entityId") as string) || null,
    after: { note: String(formData.get("note") ?? "") },
    ipAddress: requestHeaders.get("x-forwarded-for"),
    userAgent: requestHeaders.get("user-agent"),
  });

  revalidatePath("/admin/audit");
}
