"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { setEnquiryStatus } from "@/lib/enquiries";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

const STATUSES = ["NEW", "IN_PROGRESS", "CLOSED"] as const;
type Status = (typeof STATUSES)[number];

export async function setEnquiryStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!enquiryId) throw new Error("No enquiry given.");
  if (!STATUSES.includes(status as Status)) throw new Error("Unknown status.");

  const notes = formData.get("notes");

  const result = await setEnquiryStatus(
    enquiryId,
    status as Status,
    user.id,
    typeof notes === "string" ? notes : undefined,
  );

  if (!result.ok) throw new Error(result.detail);

  revalidatePath("/admin/enquiries");
}
