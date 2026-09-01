"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  addCohortMembers,
  assignDepartment,
  createCohort,
  createDepartment,
  deleteDepartment,
  enrolCohort,
  removeCohortMember,
} from "@/lib/cohorts";

/** Departments and cohorts (PRD §13.3). */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function createCohortAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();

  const result = await createCohort(
    {
      name: String(formData.get("name") ?? ""),
      organizationId: (formData.get("organizationId") as string) || null,
      courseId: (formData.get("courseId") as string) || null,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail ?? "That cohort is not valid.");

  revalidatePath("/admin/cohorts");
  redirect(`/admin/cohorts/${result.data.id}`);
}

export async function addMembersAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const cohortId = String(formData.get("cohortId") ?? "");
  const userIds = (formData.getAll("userIds") as string[]).filter(Boolean);

  if (userIds.length === 0) throw new Error("Select at least one person.");

  const result = await addCohortMembers(cohortId, userIds, user.id);
  if (!result.ok) throw new Error("That cohort no longer exists.");

  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cohortId = String(formData.get("cohortId") ?? "");

  const result = await removeCohortMember(cohortId, String(formData.get("userId") ?? ""));
  if (!result.ok) throw new Error("That person is not in this cohort.");

  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function enrolCohortAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const cohortId = String(formData.get("cohortId") ?? "");

  const result = await enrolCohort(cohortId, String(formData.get("courseId") ?? ""), user.id);

  if (!result.ok) {
    throw new Error(
      result.error === "NOT_PUBLISHED"
        ? "That course is not published, so nobody can be enrolled in it yet."
        : "That cohort or course no longer exists.",
    );
  }

  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function createDepartmentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await createDepartment(
    organizationId,
    { name: String(formData.get("name") ?? ""), code: String(formData.get("code") ?? "") },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail ?? "That department is not valid.");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function assignDepartmentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await assignDepartment(
    String(formData.get("userId") ?? ""),
    (formData.get("departmentId") as string) || null,
    user.id,
  );

  if (!result.ok) throw new Error(result.detail ?? "That assignment is not valid.");
  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function deleteDepartmentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await deleteDepartment(String(formData.get("departmentId") ?? ""), user.id);
  if (!result.ok) throw new Error("That department no longer exists.");

  revalidatePath(`/admin/organizations/${organizationId}`);
}
