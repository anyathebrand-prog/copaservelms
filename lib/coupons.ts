import { prisma } from "@/lib/prisma";
import type { DiscountType } from "@/app/generated/prisma/enums";

/**
 * Discount codes (PRD §13.2).
 *
 * Two things carry the weight here:
 *
 * - The discount is computed server-side from the stored coupon and the
 *   course's real price. A client never sends an amount, only a code.
 * - Redemption limits are enforced by a conditional UPDATE inside a
 *   transaction, not by reading the count and then writing. Two people
 *   redeeming the last use of a code at the same moment must not both succeed.
 */

export type CouponRejection =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "EXHAUSTED"
  | "USER_LIMIT"
  | "WRONG_COURSE"
  | "BELOW_MINIMUM";

export type CouponQuote = {
  couponId: string;
  code: string;
  type: DiscountType;
  discountMinor: number;
  /** What the buyer actually pays, never below zero. */
  finalMinor: number;
  description: string | null;
};

export type QuoteResult =
  | { ok: true; quote: CouponQuote }
  | { ok: false; reason: CouponRejection };

/** Human-readable reasons, safe to show a buyer. */
export const REJECTION_MESSAGES: Record<CouponRejection, string> = {
  NOT_FOUND: "That code is not recognised.",
  INACTIVE: "That code is no longer active.",
  NOT_STARTED: "That code is not valid yet.",
  EXPIRED: "That code has expired.",
  EXHAUSTED: "That code has been fully redeemed.",
  USER_LIMIT: "You have already used that code.",
  WRONG_COURSE: "That code does not apply to this course.",
  BELOW_MINIMUM: "This order is below the minimum for that code.",
};

/** Percentages round down, so a discount never exceeds what was advertised. */
export function computeDiscount(type: DiscountType, value: number, amountMinor: number): number {
  const raw = type === "PERCENT" ? Math.floor((amountMinor * value) / 100) : value;
  // Never discount more than the price: a negative total is not a refund.
  return Math.max(0, Math.min(raw, amountMinor));
}

/**
 * Price a coupon against a course without consuming it.
 *
 * Used both to show a buyer their discount and, again, at checkout — the quote
 * shown is never trusted as the quote charged.
 */
export async function quoteCoupon(
  rawCode: string,
  userId: string,
  courseId: string,
): Promise<QuoteResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "NOT_FOUND" };

  const [coupon, course] = await Promise.all([
    prisma.coupon.findUnique({
      where: { code },
      select: {
        id: true, code: true, type: true, value: true, description: true,
        maxRedemptions: true, redemptionCount: true, perUserLimit: true,
        courseId: true, minAmountMinor: true, startsAt: true, expiresAt: true, isActive: true,
      },
    }),
    prisma.course.findUnique({ where: { id: courseId }, select: { priceMinor: true } }),
  ]);

  if (!coupon || !course) return { ok: false, reason: "NOT_FOUND" };
  if (!coupon.isActive) return { ok: false, reason: "INACTIVE" };

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) return { ok: false, reason: "NOT_STARTED" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now) return { ok: false, reason: "EXPIRED" };

  // A coupon scoped to one course must not leak value onto another.
  if (coupon.courseId && coupon.courseId !== courseId) return { ok: false, reason: "WRONG_COURSE" };

  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, reason: "EXHAUSTED" };
  }

  if (course.priceMinor < coupon.minAmountMinor) return { ok: false, reason: "BELOW_MINIMUM" };

  const usedByUser = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (usedByUser >= coupon.perUserLimit) return { ok: false, reason: "USER_LIMIT" };

  const discountMinor = computeDiscount(coupon.type, coupon.value, course.priceMinor);

  return {
    ok: true,
    quote: {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discountMinor,
      finalMinor: course.priceMinor - discountMinor,
      description: coupon.description,
    },
  };
}

/**
 * Consume one use of a coupon.
 *
 * The limit check and the increment happen in a single conditional UPDATE, so
 * concurrent redemptions cannot both take the last use. The redemption row is
 * unique on (couponId, paymentId), which makes a replayed webhook a no-op
 * rather than a second consumption.
 */
export async function redeemCoupon(
  couponId: string,
  userId: string,
  discountMinor: number,
  paymentId: string | null,
): Promise<{ ok: true } | { ok: false; reason: CouponRejection }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = paymentId
        ? await tx.couponRedemption.findFirst({
            where: { couponId, paymentId },
            select: { id: true },
          })
        : null;

      // Already redeemed for this payment: idempotent success, not a second use.
      if (existing) return { ok: true as const };

      const coupon = await tx.coupon.findUniqueOrThrow({
        where: { id: couponId },
        select: { maxRedemptions: true, perUserLimit: true },
      });

      const usedByUser = await tx.couponRedemption.count({ where: { couponId, userId } });
      if (usedByUser >= coupon.perUserLimit) return { ok: false as const, reason: "USER_LIMIT" as const };

      // Conditional increment: updateMany with the limit in the WHERE clause
      // means the database decides the winner, not a read-then-write race.
      const claimed = await tx.coupon.updateMany({
        where: {
          id: couponId,
          isActive: true,
          // Omit the ceiling entirely when the coupon is unlimited. A sentinel
          // like MAX_SAFE_INTEGER overflows the INTEGER column and fails the
          // whole update, which would break every unlimited redemption.
          ...(coupon.maxRedemptions === null
            ? {}
            : { redemptionCount: { lt: coupon.maxRedemptions } }),
        },
        data: { redemptionCount: { increment: 1 } },
      });

      if (claimed.count === 0) return { ok: false as const, reason: "EXHAUSTED" as const };

      await tx.couponRedemption.create({
        data: { couponId, userId, paymentId, discountMinor },
      });

      return { ok: true as const };
    });
  } catch (error) {
    // Only a unique-constraint violation means "another request already
    // redeemed this payment", which is an idempotent success. Anything else is
    // a real failure and must not be reported as a redemption — a blanket
    // catch here would silently hand out discounts that were never recorded.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { ok: true };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listCoupons() {
  return prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, code: true, description: true, type: true, value: true,
      maxRedemptions: true, redemptionCount: true, perUserLimit: true,
      minAmountMinor: true, startsAt: true, expiresAt: true, isActive: true, createdAt: true,
      course: { select: { title: true } },
      _count: { select: { redemptions: true } },
    },
  });
}

export type CreateCouponInput = {
  code: string;
  description?: string | null;
  type: DiscountType;
  value: number;
  maxRedemptions?: number | null;
  perUserLimit?: number;
  courseId?: string | null;
  minAmountMinor?: number;
  expiresAt?: Date | null;
};

export async function createCoupon(
  input: CreateCouponInput,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: "INVALID" | "DUPLICATE"; detail?: string }> {
  const code = input.code.trim().toUpperCase();

  if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
    return { ok: false, error: "INVALID", detail: "Code must be 3–32 characters: A–Z, 0–9, hyphen." };
  }
  if (input.type === "PERCENT" && (input.value < 1 || input.value > 100)) {
    return { ok: false, error: "INVALID", detail: "A percentage must be between 1 and 100." };
  }
  if (input.type === "FIXED" && input.value < 1) {
    return { ok: false, error: "INVALID", detail: "A fixed discount must be at least 1 kobo." };
  }

  const existing = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
  if (existing) return { ok: false, error: "DUPLICATE" };

  const coupon = await prisma.$transaction(async (tx) => {
    const created = await tx.coupon.create({
      data: {
        code,
        description: input.description?.trim() || null,
        type: input.type,
        value: input.value,
        maxRedemptions: input.maxRedemptions ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        courseId: input.courseId || null,
        minAmountMinor: input.minAmountMinor ?? 0,
        expiresAt: input.expiresAt ?? null,
        createdById: actorId,
      },
      select: { id: true },
    });

    // Creating money-off is an administrative act, so it is audited (§6.2).
    await tx.auditLog.create({
      data: {
        actorId,
        action: "coupon.create",
        entityType: "Coupon",
        entityId: created.id,
        after: { code, type: input.type, value: input.value, maxRedemptions: input.maxRedemptions ?? null },
      },
    });

    return created;
  });

  return { ok: true, id: coupon.id };
}

export async function setCouponActive(
  couponId: string,
  actorId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" }> {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId }, select: { code: true } });
  if (!coupon) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.coupon.update({ where: { id: couponId }, data: { isActive } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: isActive ? "coupon.activate" : "coupon.deactivate",
        entityType: "Coupon",
        entityId: couponId,
        after: { code: coupon.code, isActive },
      },
    }),
  ]);

  return { ok: true };
}
