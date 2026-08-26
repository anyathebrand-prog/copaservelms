"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { addMembers, bulkEnrol, createOrganization, removeMember } from "@/lib/organizations";

/** Corporate account management (PRD §13.2, §13.3). Admin only. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await createOrganization(
    {
      name: String(formData.get("name") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
    },
    user.id,
  );

  if (!result.ok) {
    throw new Error(
      result.error === "DUPLICATE"
        ? "An organisation with that name already exists."
        : "Enter an organisation name.",
    );
  }

  revalidatePath("/admin/organizations");
  redirect(`/admin/organizations/${result.id}`);
}

export async function addMembersAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await addMembers(organizationId, String(formData.get("emails") ?? ""), user.id);
  if (!result.ok) throw new Error("That organisation no longer exists.");

  // Surface rejected addresses rather than silently dropping them — a typo in
  // a pasted staff list should not quietly mean one person never gets access.
  if (result.result.invalid.length > 0) {
    const shown = result.result.invalid.slice(0, 5).join(", ");
    const more = result.result.invalid.length > 5 ? ` and ${result.result.invalid.length - 5} more` : "";
    throw new Error(
      `Added ${result.result.created.length + result.result.linked.length}. ` +
        `These were not valid email addresses: ${shown}${more}`,
    );
  }

  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function bulkEnrolAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await bulkEnrol(organizationId, String(formData.get("courseId") ?? ""), user.id);

  if (!result.ok) {
    throw new Error(
      result.error === "NOT_PUBLISHED"
        ? "That course is not published, so nobody can be enrolled in it yet."
        : "That organisation or course no longer exists.",
    );
  }

  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await removeMember(organizationId, String(formData.get("userId") ?? ""), user.id);
  if (!result.ok) throw new Error("That member is not in this organisation.");

  revalidatePath(`/admin/organizations/${organizationId}`);
}
