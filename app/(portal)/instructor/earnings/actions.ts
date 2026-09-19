"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { savePayoutAccount } from "@/lib/earnings";

/**
 * Save where to be paid.
 *
 * The caller's own account only: the user comes from the session, never the
 * form, so nobody can point another instructor's money at their own bank.
 */
export async function savePayoutAccountAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"].some((role) => user.roles.includes(role as never))) {
    throw new Error("Only instructors have payout details.");
  }

  const result = await savePayoutAccount(user.id, {
    bankName: String(formData.get("bankName") ?? ""),
    accountNumber: String(formData.get("accountNumber") ?? ""),
    accountName: String(formData.get("accountName") ?? ""),
  });

  if (!result.ok) throw new Error(result.detail);
  revalidatePath("/instructor/earnings");
}
