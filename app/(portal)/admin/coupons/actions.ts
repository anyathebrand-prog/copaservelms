"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { createCoupon, setCouponActive } from "@/lib/coupons";
import type { DiscountType } from "@/app/generated/prisma/enums";

/** Coupon management (PRD §13.2). Admin only — a coupon is money off. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function createCouponAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const type = (formData.get("type") as DiscountType) || "PERCENT";
  const rawValue = Number(formData.get("value"));
  const maxRedemptions = String(formData.get("maxRedemptions") ?? "").trim();
  const expiresAt = String(formData.get("expiresAt") ?? "").trim();
  const minAmount = String(formData.get("minAmountMajor") ?? "").trim();

  const result = await createCoupon(
    {
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? ""),
      type,
      // A percentage is a number; a fixed discount is entered in naira and
      // stored in kobo, like every other amount in the system.
      value: type === "PERCENT" ? rawValue : Math.round(rawValue * 100),
      maxRedemptions: maxRedemptions === "" ? null : Number(maxRedemptions),
      perUserLimit: Number(formData.get("perUserLimit") ?? 1) || 1,
      courseId: (formData.get("courseId") as string) || null,
      minAmountMinor: minAmount === "" ? 0 : Math.round(Number(minAmount) * 100),
      expiresAt: expiresAt === "" ? null : new Date(expiresAt),
    },
    user.id,
  );

  if (!result.ok) {
    throw new Error(
      result.error === "DUPLICATE"
        ? "That code already exists."
        : (result.detail ?? "That coupon is not valid."),
    );
  }

  revalidatePath("/admin/coupons");
}

export async function toggleCouponAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await setCouponActive(
    String(formData.get("couponId") ?? ""),
    user.id,
    formData.get("isActive") === "true",
  );

  if (!result.ok) throw new Error("That coupon no longer exists.");
  revalidatePath("/admin/coupons");
}
