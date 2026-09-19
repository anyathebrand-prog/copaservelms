import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * What instructors are owed, and paying it out.
 *
 * The terms, in one place:
 *
 *   - 70% of every sale to the instructor, 30% to CopaServe, on what the
 *     learner actually paid — after any discount code. The payment gateway's
 *     fee comes out of CopaServe's share, so an instructor's number is the one
 *     a learner would recognise.
 *   - Held for 30 days from payment, so a refund or chargeback in that window
 *     is absorbed before any money has left. The hold is a date on each
 *     earning, not a job that has to run: an earning is available once its
 *     date has passed, whether or not anything checked.
 *   - Paid out only when an instructor's available balance reaches ₦20,000,
 *     so the business is not processing a stream of tiny transfers.
 *
 * Rounding never overpays: the instructor's share is rounded down to the kobo
 * and CopaServe keeps the remainder. Across thousands of sales that is still
 * less than a naira per sale, and it cannot produce a payout larger than what
 * was taken.
 *
 * The share rate is stored on every earning (shareBps). If the split ever
 * changes, sales already made keep the terms they were made under.
 */

export const INSTRUCTOR_SHARE_BPS = 7_000; // 70.00%
export const HOLD_DAYS = 30;
export const MIN_PAYOUT_MINOR = 2_000_000; // ₦20,000 in kobo

const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export type EarningsError = "INVALID" | "NOT_FOUND" | "BELOW_MINIMUM" | "NO_ACCOUNT" | "WRONG_STATE";
export type Result<T> = { ok: true; data: T } | { ok: false; error: EarningsError; detail: string };

/** Split an amount in kobo. The instructor's part is rounded down. */
export function split(grossMinor: number, shareBps = INSTRUCTOR_SHARE_BPS) {
  const shareMinor = Math.floor((grossMinor * shareBps) / 10_000);
  return { shareMinor, platformMinor: grossMinor - shareMinor };
}

export function formatNaira(minor: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(minor / 100)
    .replace(/\.00$/, "");
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Credit the instructor for a sale.
 *
 * Called inside the transaction that marks the payment successful, so an
 * earning cannot exist without its payment, nor a paid course without its
 * earning. A database index allows one SALE per payment; if this runs twice
 * for the same payment the second write fails and the transaction with it,
 * which is the right outcome for money.
 *
 * A free course, or one whose instructor cannot be found, earns nothing.
 */
export async function recordSaleEarning(
  tx: Tx,
  payment: { id: string; courseId: string | null; amountMinor: number; currency: string },
  paidAt: Date,
): Promise<void> {
  if (!payment.courseId || payment.amountMinor <= 0) return;

  const course = await tx.course.findUnique({
    where: { id: payment.courseId },
    select: { instructorId: true },
  });
  if (!course) return;

  const { shareMinor, platformMinor } = split(payment.amountMinor);

  await tx.instructorEarning.create({
    data: {
      instructorId: course.instructorId,
      paymentId: payment.id,
      courseId: payment.courseId,
      kind: "SALE",
      grossMinor: payment.amountMinor,
      shareMinor,
      platformMinor,
      shareBps: INSTRUCTOR_SHARE_BPS,
      currency: payment.currency,
      availableAt: new Date(paidAt.getTime() + HOLD_DAYS * DAY_MS),
    },
  });
}

/**
 * Record a refund or chargeback against a successful payment.
 *
 * The money itself is returned in the gateway's dashboard; this records that
 * it happened, updates the payment, and settles the instructor's side:
 *
 *   - Still in the hold and not yet paid out: the sale is voided (in full) or
 *     reduced (in part). The instructor was never paid it, so nothing is
 *     taken back.
 *   - Already paid out, or already in a payout being prepared: a negative
 *     REFUND earning, available at once, which comes off their next payout.
 *
 * Refunding more than was paid is refused.
 */
export async function recordRefund(
  paymentId: string,
  refundMinor: number,
  actorId: string,
  reason: string,
): Promise<Result<{ refundedMinor: number; voided: boolean }>> {
  if (!Number.isInteger(refundMinor) || refundMinor <= 0) {
    return { ok: false, error: "INVALID", detail: "Enter the amount refunded." };
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, amountMinor: true, refundedMinor: true, currency: true },
    });
    if (!payment) return { ok: false, error: "NOT_FOUND", detail: "That payment no longer exists." };
    if (payment.status !== "SUCCESSFUL" && payment.status !== "REFUNDED") {
      return { ok: false, error: "WRONG_STATE", detail: "Only a successful payment can be refunded." };
    }

    const remaining = payment.amountMinor - payment.refundedMinor;
    if (refundMinor > remaining) {
      return {
        ok: false,
        error: "INVALID",
        detail: `That is more than is left to refund (${formatNaira(remaining)}).`,
      };
    }

    const refundedMinor = payment.refundedMinor + refundMinor;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedMinor,
        status: refundedMinor >= payment.amountMinor ? "REFUNDED" : "SUCCESSFUL",
      },
    });

    const sale = await tx.instructorEarning.findFirst({
      where: { paymentId, kind: "SALE" },
      select: { id: true, instructorId: true, courseId: true, status: true, grossMinor: true, shareMinor: true, shareBps: true },
    });

    let voided = false;

    if (sale && sale.status !== "VOID") {
      // The instructor's part of the refund, at the rate the sale was made at.
      const { shareMinor: shareBack, platformMinor: platformBack } = split(refundMinor, sale.shareBps);

      if (sale.status === "OPEN") {
        const newGross = sale.grossMinor - refundMinor;
        if (newGross <= 0) {
          await tx.instructorEarning.update({
            where: { id: sale.id },
            data: { status: "VOID", voidedAt: new Date(), note: `Refunded: ${reason}` },
          });
          voided = true;
        } else {
          const reduced = split(newGross, sale.shareBps);
          await tx.instructorEarning.update({
            where: { id: sale.id },
            data: {
              grossMinor: newGross,
              shareMinor: reduced.shareMinor,
              platformMinor: reduced.platformMinor,
              note: `Partly refunded: ${reason}`,
            },
          });
        }
      } else {
        // Paid, or committed to a payout: take it back from the next one.
        await tx.instructorEarning.create({
          data: {
            instructorId: sale.instructorId,
            paymentId,
            courseId: sale.courseId,
            kind: "REFUND",
            grossMinor: -refundMinor,
            shareMinor: -shareBack,
            platformMinor: -platformBack,
            shareBps: sale.shareBps,
            currency: payment.currency,
            availableAt: new Date(),
            note: reason,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "payment.refunded",
        entityType: "Payment",
        entityId: paymentId,
        after: { refundMinor, refundedMinor, reason, earning: sale ? (voided ? "voided" : sale.status === "OPEN" ? "reduced" : "deducted") : "none" } as never,
      },
    });

    return { ok: true, data: { refundedMinor, voided } };
  });
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export type Balance = {
  /** Still in the 30-day hold. */
  heldMinor: number;
  /** Past the hold, not yet paid — net of any refunds to take back. */
  availableMinor: number;
  /** In a payout an admin has prepared but not yet marked sent. */
  inPayoutMinor: number;
  /** Everything ever paid out. */
  paidMinor: number;
  /** When the next held earning becomes available, if any. */
  nextReleaseAt: Date | null;
  /** Whether available has reached the minimum. */
  payable: boolean;
};

export async function getBalance(instructorId: string, now = new Date()): Promise<Balance> {
  const rows = await prisma.instructorEarning.findMany({
    where: { instructorId, status: { in: ["OPEN", "IN_PAYOUT", "PAID"] } },
    select: { status: true, shareMinor: true, availableAt: true },
  });

  let heldMinor = 0;
  let availableMinor = 0;
  let inPayoutMinor = 0;
  let paidMinor = 0;
  let nextReleaseAt: Date | null = null;

  for (const row of rows) {
    if (row.status === "PAID") paidMinor += row.shareMinor;
    else if (row.status === "IN_PAYOUT") inPayoutMinor += row.shareMinor;
    else if (row.availableAt <= now) availableMinor += row.shareMinor;
    else {
      heldMinor += row.shareMinor;
      if (!nextReleaseAt || row.availableAt < nextReleaseAt) nextReleaseAt = row.availableAt;
    }
  }

  return {
    heldMinor,
    availableMinor,
    inPayoutMinor,
    paidMinor,
    nextReleaseAt,
    payable: availableMinor >= MIN_PAYOUT_MINOR,
  };
}

// ---------------------------------------------------------------------------
// Payout accounts
// ---------------------------------------------------------------------------

export async function savePayoutAccount(
  userId: string,
  input: { bankName: string; accountNumber: string; accountName: string },
): Promise<Result<{ id: string }>> {
  const bankName = input.bankName.trim().slice(0, 80);
  const accountNumber = input.accountNumber.replace(/\s+/g, "");
  const accountName = input.accountName.trim().slice(0, 120);

  if (!bankName) return { ok: false, error: "INVALID", detail: "Enter your bank." };
  if (!/^\d{10}$/.test(accountNumber)) {
    return { ok: false, error: "INVALID", detail: "A Nigerian account number is 10 digits." };
  }
  if (accountName.length < 3) return { ok: false, error: "INVALID", detail: "Enter the name on the account." };

  const account = await prisma.payoutAccount.upsert({
    where: { userId },
    update: { bankName, accountNumber, accountName },
    create: { userId, bankName, accountNumber, accountName },
    select: { id: true },
  });

  // Where money goes is worth an audit line — including the fact that it
  // changed — but not the number itself, which is kept on the account row.
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "payout_account.saved",
      entityType: "PayoutAccount",
      entityId: account.id,
      after: { bankName, accountEnding: accountNumber.slice(-4) } as never,
    },
  });

  return { ok: true, data: account };
}

export function getPayoutAccount(userId: string) {
  return prisma.payoutAccount.findUnique({
    where: { userId },
    select: { bankName: true, accountNumber: true, accountName: true, updatedAt: true },
  });
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/**
 * Gather an instructor's available earnings into a payout.
 *
 * Commits the rows (OPEN → IN_PAYOUT) in one transaction, so a sale cannot be
 * counted into two payouts, and refuses below the minimum or without an
 * account. The admin then makes the transfer and marks it paid.
 */
export async function createPayout(instructorId: string, actorId: string): Promise<Result<{ id: string; amountMinor: number }>> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.payoutAccount.findUnique({ where: { userId: instructorId } });
    if (!account) {
      return { ok: false, error: "NO_ACCOUNT", detail: "This instructor has not given bank details yet." };
    }

    const now = new Date();
    const rows = await tx.instructorEarning.findMany({
      where: { instructorId, status: "OPEN", availableAt: { lte: now } },
      select: { id: true, shareMinor: true },
    });
    const amountMinor = rows.reduce((sum, row) => sum + row.shareMinor, 0);

    if (amountMinor < MIN_PAYOUT_MINOR) {
      return {
        ok: false,
        error: "BELOW_MINIMUM",
        detail: `Available is ${formatNaira(Math.max(amountMinor, 0))}; payouts start at ${formatNaira(MIN_PAYOUT_MINOR)}.`,
      };
    }

    const payout = await tx.instructorPayout.create({
      data: {
        instructorId,
        amountMinor,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
      },
      select: { id: true },
    });

    // Only the rows counted above, and only if still OPEN: a concurrent run
    // that already took them leaves this with fewer, which the check catches.
    const moved = await tx.instructorEarning.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: "OPEN" },
      data: { status: "IN_PAYOUT", payoutId: payout.id },
    });
    if (moved.count !== rows.length) {
      throw new Error("Earnings changed while the payout was being prepared. Try again.");
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "payout.created",
        entityType: "InstructorPayout",
        entityId: payout.id,
        after: { instructorId, amountMinor, earnings: rows.length } as never,
      },
    });

    return { ok: true, data: { id: payout.id, amountMinor } };
  });
}

/** The transfer has been made. Records its reference and settles the earnings. */
export async function markPayoutPaid(payoutId: string, reference: string, actorId: string): Promise<Result<{ id: string }>> {
  const ref = reference.trim().slice(0, 120);
  if (!ref) return { ok: false, error: "INVALID", detail: "Enter the bank transfer reference." };

  return prisma.$transaction(async (tx) => {
    const payout = await tx.instructorPayout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!payout) return { ok: false, error: "NOT_FOUND", detail: "That payout no longer exists." };
    if (payout.status !== "PENDING") return { ok: false, error: "WRONG_STATE", detail: "That payout is already settled." };

    await tx.instructorPayout.update({
      where: { id: payoutId },
      data: { status: "PAID", reference: ref, paidAt: new Date(), recordedById: actorId },
    });
    await tx.instructorEarning.updateMany({
      where: { payoutId, status: "IN_PAYOUT" },
      data: { status: "PAID" },
    });
    await tx.auditLog.create({
      data: { actorId, action: "payout.paid", entityType: "InstructorPayout", entityId: payoutId, after: { reference: ref } as never },
    });

    return { ok: true, data: { id: payoutId } };
  });
}

/** Called off before any money moved. The earnings go back to available. */
export async function cancelPayout(payoutId: string, actorId: string): Promise<Result<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.instructorPayout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!payout) return { ok: false, error: "NOT_FOUND", detail: "That payout no longer exists." };
    if (payout.status !== "PENDING") return { ok: false, error: "WRONG_STATE", detail: "Only an unsent payout can be cancelled." };

    await tx.instructorPayout.update({
      where: { id: payoutId },
      data: { status: "CANCELLED", cancelledAt: new Date(), recordedById: actorId },
    });
    await tx.instructorEarning.updateMany({
      where: { payoutId, status: "IN_PAYOUT" },
      data: { status: "OPEN", payoutId: null },
    });
    await tx.auditLog.create({
      data: { actorId, action: "payout.cancelled", entityType: "InstructorPayout", entityId: payoutId },
    });

    return { ok: true, data: { id: payoutId } };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function listEarnings(instructorId: string) {
  return prisma.instructorEarning.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, kind: true, status: true, grossMinor: true, shareMinor: true,
      availableAt: true, createdAt: true, note: true,
      payment: { select: { reference: true, course: { select: { title: true } } } },
    },
  });
}

export function listPayouts(instructorId?: string) {
  return prisma.instructorPayout.findMany({
    where: instructorId ? { instructorId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, amountMinor: true, status: true, bankName: true, accountNumber: true,
      accountName: true, reference: true, paidAt: true, createdAt: true,
      instructor: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      _count: { select: { earnings: true } },
    },
  });
}

/** Every instructor with money in the system, and whether they can be paid now. */
export async function listInstructorBalances() {
  const instructors = await prisma.user.findMany({
    where: { earnings: { some: {} } },
    select: {
      id: true, email: true,
      profile: { select: { firstName: true, lastName: true } },
      payoutAccount: { select: { bankName: true, accountNumber: true, accountName: true } },
    },
  });

  return Promise.all(
    instructors.map(async (instructor) => ({ ...instructor, balance: await getBalance(instructor.id) })),
  );
}
