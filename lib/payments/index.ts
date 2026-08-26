import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getPaymentDriver, type PaymentDriver, type VerifiedPayment } from "./provider";
import type { PaymentProvider } from "@/app/generated/prisma/enums";

/**
 * Payment lifecycle (PRD §13.2).
 *
 * The rules that matter, because this is the part where mistakes cost money:
 *
 * - The amount charged is read from the course at checkout time, never from
 *   the client. A price in a form field is a price the payer can edit.
 * - Enrolment is granted only after the *provider* confirms payment, never on
 *   the strength of a redirect back to our callback URL — anyone can visit a
 *   callback URL.
 * - Finalisation is idempotent. Webhook and callback both land here, often
 *   both for the same payment, and a replayed webhook must not double-enrol or
 *   double-count revenue.
 */

export type CheckoutError =
  | "NOT_FOUND"
  | "ALREADY_ENROLLED"
  | "FREE_COURSE"
  | "NOT_PUBLISHED"
  | "NO_PROVIDER"
  | "PROVIDER_FAILED";

export type Result<T, E> = { ok: true; data: T } | { ok: false; error: E; detail?: string };

/** `CS-<random>`: namespaced so it is recognisable in a provider dashboard. */
function newReference(): string {
  return `CS-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

export async function startCheckout(
  userId: string,
  courseId: string,
  provider: PaymentProvider,
  origin: string,
  /** Injection seam for tests, so the real flow can run without live keys. */
  driverOverride?: PaymentDriver,
): Promise<Result<{ checkoutUrl: string; reference: string }, CheckoutError>> {
  const [course, user, existing] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true, priceMinor: true, currency: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.enrollment.findFirst({ where: { userId, courseId }, select: { id: true } }),
  ]);

  if (!course || !user) return { ok: false, error: "NOT_FOUND" };
  if (course.status !== "PUBLISHED") return { ok: false, error: "NOT_PUBLISHED" };
  if (existing) return { ok: false, error: "ALREADY_ENROLLED" };
  // A free course needs no payment; enrolling directly is the correct path.
  if (course.priceMinor <= 0) return { ok: false, error: "FREE_COURSE" };

  const reference = newReference();

  // The row is written before the provider is called, so a checkout that is
  // started and abandoned still leaves a PENDING record to reconcile against.
  await prisma.payment.create({
    data: {
      userId,
      courseId,
      provider,
      reference,
      status: "PENDING",
      // Authoritative amount: taken from the course, never from the request.
      amountMinor: course.priceMinor,
      currency: course.currency,
    },
  });

  try {
    const driver = driverOverride ?? getPaymentDriver(provider);
    const { checkoutUrl } = await driver.createCheckout({
      reference,
      amountMinor: course.priceMinor,
      currency: course.currency,
      email: user.email,
      callbackUrl: `${origin}/payments/callback?reference=${encodeURIComponent(reference)}`,
      metadata: { courseId, userId, courseTitle: course.title },
    });

    return { ok: true, data: { checkoutUrl, reference } };
  } catch (error) {
    await prisma.payment.update({
      where: { reference },
      data: { status: "FAILED", providerPayload: { error: String(error) } as never },
    });

    return {
      ok: false,
      error: "PROVIDER_FAILED",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export type FinaliseOutcome =
  | "ENROLLED"
  | "ALREADY_FINALISED"
  | "FAILED"
  | "PENDING"
  | "AMOUNT_MISMATCH"
  | "UNKNOWN_REFERENCE";

/**
 * Confirm a payment with the provider and, if it succeeded, grant enrolment.
 *
 * Safe to call repeatedly and from both the webhook and the callback: a
 * payment already marked SUCCESSFUL short-circuits, and the enrolment is
 * created inside the same transaction that marks it paid.
 */
export async function finalisePayment(
  reference: string,
  driverOverride?: PaymentDriver,
): Promise<FinaliseOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: {
      id: true, userId: true, courseId: true, provider: true,
      amountMinor: true, currency: true, status: true, enrollmentId: true,
    },
  });

  if (!payment) return "UNKNOWN_REFERENCE";
  if (payment.status === "SUCCESSFUL") return "ALREADY_FINALISED";

  let verified: VerifiedPayment;
  try {
    verified = await (driverOverride ?? getPaymentDriver(payment.provider)).verify(reference);
  } catch {
    // A verification outage must not mark the payment failed — that would deny
    // a payer who has actually been charged. Leave it pending for retry.
    return "PENDING";
  }

  if (verified.status === "PENDING") return "PENDING";

  if (verified.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", providerPayload: verified.raw as never },
    });
    return "FAILED";
  }

  // Underpayment is not enrolment. Record it and hold for an admin rather than
  // granting access for less than the asking price.
  if (verified.amountMinor < payment.amountMinor) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PENDING", providerPayload: verified.raw as never },
    });
    return "AMOUNT_MISMATCH";
  }

  await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: two webhooks arriving together would
    // otherwise both pass the check above and both create an enrolment.
    const current = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true },
    });
    if (current.status === "SUCCESSFUL") return;

    const enrollment = await tx.enrollment.upsert({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId! } },
      update: {},
      create: {
        userId: payment.userId,
        courseId: payment.courseId!,
        status: "ACTIVE",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESSFUL",
        paidAt: verified.paidAt ?? new Date(),
        enrollmentId: enrollment.id,
        providerPayload: verified.raw as never,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: null, // provider-initiated, not a person
        action: "payment.succeeded",
        entityType: "Payment",
        entityId: payment.id,
        after: {
          reference,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          provider: payment.provider,
        },
      },
    });
  });

  return "ENROLLED";
}

/** Free-course enrolment, the path that needs no payment at all. */
export async function enrolFree(
  userId: string,
  courseId: string,
): Promise<Result<{ enrollmentId: string }, CheckoutError>> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, priceMinor: true },
  });

  if (!course) return { ok: false, error: "NOT_FOUND" };
  if (course.status !== "PUBLISHED") return { ok: false, error: "NOT_PUBLISHED" };
  // Guard the inverse of startCheckout: a paid course must go through checkout.
  if (course.priceMinor > 0) return { ok: false, error: "PROVIDER_FAILED", detail: "Course is not free." };

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId, status: "ACTIVE", startedAt: new Date() },
    select: { id: true },
  });

  return { ok: true, data: { enrollmentId: enrollment.id } };
}

export async function getPaymentsForUser(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, reference: true, provider: true, status: true,
      amountMinor: true, currency: true, paidAt: true, createdAt: true,
      course: { select: { title: true, slug: true } },
    },
  });
}

/** Admin payments view (§13.2), with revenue totals. */
export async function getPaymentsOverview(status?: "PENDING" | "SUCCESSFUL" | "FAILED" | "REFUNDED") {
  const [payments, totals] = await Promise.all([
    prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, reference: true, provider: true, status: true,
        amountMinor: true, currency: true, refundedMinor: true, paidAt: true, createdAt: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        course: { select: { title: true } },
      },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCESSFUL" },
      _sum: { amountMinor: true, refundedMinor: true },
      _count: true,
    }),
  ]);

  return {
    payments,
    grossMinor: totals._sum.amountMinor ?? 0,
    refundedMinor: totals._sum.refundedMinor ?? 0,
    netMinor: (totals._sum.amountMinor ?? 0) - (totals._sum.refundedMinor ?? 0),
    successfulCount: totals._count,
  };
}
