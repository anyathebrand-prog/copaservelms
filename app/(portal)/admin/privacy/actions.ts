"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { resolveDataRequest } from "@/lib/privacy";

/** Compliance queue actions (PRD §12.3). */
export async function resolveRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");

  const status = String(formData.get("status") ?? "") as "IN_PROGRESS" | "COMPLETED" | "REJECTED";

  const result = await resolveDataRequest(
    user.id,
    String(formData.get("requestId") ?? ""),
    status,
    String(formData.get("resolution") ?? ""),
  );

  if (!result.ok) {
    throw new Error(
      result.error === "INVALID"
        ? "Record what was done — the resolution is the compliance record."
        : "That request no longer exists.",
    );
  }

  revalidatePath("/admin/privacy");
}
