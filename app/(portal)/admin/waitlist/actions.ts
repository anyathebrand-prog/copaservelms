"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { markInvited } from "@/lib/waitlist";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function markInvitedAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const ids = (formData.getAll("entryId") as string[]).filter(Boolean);
  if (ids.length === 0) throw new Error("Select at least one person.");

  await markInvited(ids);
  revalidatePath("/admin/waitlist");
}
