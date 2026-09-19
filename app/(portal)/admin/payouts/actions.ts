"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { cancelPayout, createPayout, markPayoutPaid, recordRefund } from "@/lib/earnings";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

function refresh() {
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/payments");
  revalidatePath("/instructor/earnings");
}

export async function createPayoutAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const result = await createPayout(String(formData.get("instructorId") ?? ""), admin.id);
  if (!result.ok) throw new Error(result.detail);
  refresh();
}

export async function markPayoutPaidAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const result = await markPayoutPaid(
    String(formData.get("payoutId") ?? ""),
    String(formData.get("reference") ?? ""),
    admin.id,
  );
  if (!result.ok) throw new Error(result.detail);
  refresh();
}

export async function cancelPayoutAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const result = await cancelPayout(String(formData.get("payoutId") ?? ""), admin.id);
  if (!result.ok) throw new Error(result.detail);
  refresh();
}

/**
 * Record a refund or chargeback made in the gateway's dashboard.
 *
 * The form takes naira, because that is what the admin will be looking at in
 * Kora; it is converted to kobo here, and only whole kobo are accepted.
 */
export async function recordRefundAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const naira = Number(String(formData.get("amount") ?? "").replace(/,/g, ""));
  const minor = Math.round(naira * 100);
  if (!Number.isFinite(naira) || naira <= 0 || Math.abs(naira * 100 - minor) > 1e-6) {
    throw new Error("Enter the amount refunded, in naira.");
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "Refund";
  const result = await recordRefund(String(formData.get("paymentId") ?? ""), minor, admin.id, reason);
  if (!result.ok) throw new Error(result.detail);
  refresh();
}
