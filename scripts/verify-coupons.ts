/**
 * Functional checks for discount codes (PRD §13.2).
 *
 * A coupon is money off, so the interesting cases are the ones where it should
 * NOT apply: expired, exhausted, wrong course, already used, below minimum.
 * Redemption limits are also raced deliberately, because a read-then-write
 * implementation passes every sequential test and still oversells.
 *
 *   npx tsx scripts/verify-coupons.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { computeDiscount, createCoupon, quoteCoupon, redeemCoupon, setCouponActive } from "../lib/coupons";
import { startCheckout, finalisePayment } from "../lib/payments";
import type { PaymentDriver } from "../lib/payments/provider";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];
const createdCoupons: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  const payments = await prisma.payment.findMany({
    where: { userId: { in: createdUsers } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: [...payments.map((p) => p.id), ...createdCoupons] } }, { actorId: { in: createdUsers } }] },
  });
  await prisma.couponRedemption.deleteMany({ where: { couponId: { in: createdCoupons } } });
  await prisma.payment.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.coupon.deleteMany({ where: { id: { in: createdCoupons } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

const stubDriver: PaymentDriver = {
  id: "PAYSTACK",
  createCheckout: async () => ({ checkoutUrl: "https://checkout.test/pay" }),
  verify: async (reference) => ({
    reference, amountMinor: lastCharged, currency: "NGN", status: "SUCCESSFUL",
    providerReference: "prov", paidAt: new Date(), raw: {},
  }),
  verifySignature: () => true,
  parseWebhook: () => null,
};

/** What the provider will claim was charged — set from the payment row. */
let lastCharged = 0;

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `cpn-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Coupon", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const buyer = await prisma.user.create({
    data: { email: `cpn-buyer-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Coupon", lastName: "Buyer" } } },
  });
  createdUsers.push(buyer.id);

  const other = await prisma.user.create({
    data: { email: `cpn-other-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Other", lastName: "Buyer" } } },
  });
  createdUsers.push(other.id);

  const course = await prisma.course.create({
    data: { title: `Coupon Course ${RUN}`, slug: `coupon-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 1000000, currency: "NGN" },
    select: { id: true },
  });
  createdCourses.push(course.id);

  const otherCourse = await prisma.course.create({
    data: { title: `Other Course ${RUN}`, slug: `other-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 1000000 },
    select: { id: true },
  });
  createdCourses.push(otherCourse.id);

  // --- arithmetic ---------------------------------------------------------
  check("percentage discount computes correctly",
    computeDiscount("PERCENT", 20, 1000000) === 200000, `${computeDiscount("PERCENT", 20, 1000000)}`);
  check("fixed discount computes correctly",
    computeDiscount("FIXED", 250000, 1000000) === 250000, `${computeDiscount("FIXED", 250000, 1000000)}`);
  check("a discount never exceeds the price",
    computeDiscount("FIXED", 5000000, 1000000) === 1000000, `${computeDiscount("FIXED", 5000000, 1000000)}`);
  check("percentages round down, never up",
    computeDiscount("PERCENT", 33, 1000) === 330, `${computeDiscount("PERCENT", 33, 1000)}`);

  // --- validation ---------------------------------------------------------
  const badPercent = await createCoupon({ code: `BAD${RUN}`, type: "PERCENT", value: 150 }, teacher.id);
  check("refuses a percentage above 100", !badPercent.ok, badPercent.ok ? "created!" : badPercent.error);

  const badCode = await createCoupon({ code: "a b", type: "PERCENT", value: 10 }, teacher.id);
  check("refuses a malformed code", !badCode.ok, badCode.ok ? "created!" : badCode.error);

  const created = await createCoupon(
    { code: `SAVE20${RUN}`, description: "20% off", type: "PERCENT", value: 20, maxRedemptions: 2 },
    teacher.id,
  );
  check("creates a valid coupon", created.ok, created.ok ? created.id : created.error);
  if (!created.ok) return finish();
  createdCoupons.push(created.id);

  const duplicate = await createCoupon({ code: `save20${RUN}`, type: "PERCENT", value: 5 }, teacher.id);
  check("codes are case-insensitively unique", !duplicate.ok && duplicate.error === "DUPLICATE",
    duplicate.ok ? "created!" : duplicate.error);

  // --- quoting ------------------------------------------------------------
  const quoted = await quoteCoupon(`save20${RUN}`, buyer.id, course.id);
  check("lowercase input matches an uppercase code", quoted.ok, quoted.ok ? "matched" : quoted.reason);
  check("quote prices the discount and the total",
    quoted.ok && quoted.quote.discountMinor === 200000 && quoted.quote.finalMinor === 800000,
    quoted.ok ? `${quoted.quote.discountMinor} off, ${quoted.quote.finalMinor} payable` : "");

  const unknown = await quoteCoupon("NOPE-DOES-NOT-EXIST", buyer.id, course.id);
  check("unknown code is rejected", !unknown.ok && unknown.reason === "NOT_FOUND",
    unknown.ok ? "accepted!" : unknown.reason);

  // --- scoping ------------------------------------------------------------
  const scoped = await createCoupon(
    { code: `SCOPED${RUN}`, type: "PERCENT", value: 50, courseId: course.id },
    teacher.id,
  );
  if (scoped.ok) createdCoupons.push(scoped.id);

  const wrongCourse = await quoteCoupon(`SCOPED${RUN}`, buyer.id, otherCourse.id);
  check("a course-scoped code is refused on another course",
    !wrongCourse.ok && wrongCourse.reason === "WRONG_COURSE",
    wrongCourse.ok ? "accepted!" : wrongCourse.reason);

  const rightCourse = await quoteCoupon(`SCOPED${RUN}`, buyer.id, course.id);
  check("a course-scoped code works on its own course", rightCourse.ok,
    rightCourse.ok ? "accepted" : rightCourse.reason);

  // --- expiry and minimum -------------------------------------------------
  const expired = await createCoupon(
    { code: `EXPIRED${RUN}`, type: "PERCENT", value: 10, expiresAt: new Date(Date.now() - 86400000) },
    teacher.id,
  );
  if (expired.ok) createdCoupons.push(expired.id);
  const expiredQuote = await quoteCoupon(`EXPIRED${RUN}`, buyer.id, course.id);
  check("an expired code is refused", !expiredQuote.ok && expiredQuote.reason === "EXPIRED",
    expiredQuote.ok ? "accepted!" : expiredQuote.reason);

  const highMin = await createCoupon(
    { code: `BIGONLY${RUN}`, type: "FIXED", value: 100000, minAmountMinor: 5000000 },
    teacher.id,
  );
  if (highMin.ok) createdCoupons.push(highMin.id);
  const belowMin = await quoteCoupon(`BIGONLY${RUN}`, buyer.id, course.id);
  check("a code below its minimum order value is refused",
    !belowMin.ok && belowMin.reason === "BELOW_MINIMUM", belowMin.ok ? "accepted!" : belowMin.reason);

  // --- deactivation -------------------------------------------------------
  await setCouponActive(scoped.ok ? scoped.id : "", teacher.id, false);
  const deactivated = await quoteCoupon(`SCOPED${RUN}`, buyer.id, course.id);
  check("a deactivated code is refused", !deactivated.ok && deactivated.reason === "INACTIVE",
    deactivated.ok ? "accepted!" : deactivated.reason);

  // --- checkout integration ----------------------------------------------
  const checkout = await startCheckout(buyer.id, course.id, "PAYSTACK", "http://localhost:3000", {
    couponCode: `SAVE20${RUN}`, driverOverride: stubDriver,
  });
  const reference = checkout.ok && "reference" in checkout.data ? checkout.data.reference : null;
  check("checkout accepts a valid code", reference !== null, reference ?? "failed");

  const row = await prisma.payment.findUniqueOrThrow({ where: { reference: reference! } });
  check("the discounted amount is what gets charged",
    row.amountMinor === 800000 && row.discountMinor === 200000,
    `${row.amountMinor} charged, ${row.discountMinor} off`);

  const beforeConfirm = await prisma.couponRedemption.count({ where: { couponId: created.id } });
  check("starting checkout does not consume the code", beforeConfirm === 0, `${beforeConfirm} redemption(s)`);

  lastCharged = row.amountMinor;
  await finalisePayment(reference!, stubDriver);

  const afterConfirm = await prisma.couponRedemption.count({ where: { couponId: created.id } });
  check("confirming payment consumes the code once", afterConfirm === 1, `${afterConfirm} redemption(s)`);

  await finalisePayment(reference!, stubDriver);
  const afterReplay = await prisma.couponRedemption.count({ where: { couponId: created.id } });
  check("a replayed webhook does not consume it twice", afterReplay === 1, `${afterReplay} redemption(s)`);

  const perUser = await quoteCoupon(`SAVE20${RUN}`, buyer.id, otherCourse.id);
  check("per-user limit blocks a second use", !perUser.ok && perUser.reason === "USER_LIMIT",
    perUser.ok ? "accepted!" : perUser.reason);

  // --- a rejected code must not silently become full price ----------------
  const rejected = await startCheckout(other.id, course.id, "PAYSTACK", "http://localhost:3000", {
    couponCode: `EXPIRED${RUN}`, driverOverride: stubDriver,
  });
  check("checkout fails rather than charging full price on a bad code",
    !rejected.ok && rejected.error === "COUPON_REJECTED",
    rejected.ok ? "charged!" : `${rejected.error}`);

  // --- 100% off -----------------------------------------------------------
  const freebie = await createCoupon({ code: `FREE100${RUN}`, type: "PERCENT", value: 100 }, teacher.id);
  if (freebie.ok) createdCoupons.push(freebie.id);

  const fullyDiscounted = await startCheckout(other.id, course.id, "PAYSTACK", "http://localhost:3000", {
    couponCode: `FREE100${RUN}`, driverOverride: stubDriver,
  });
  check("a 100% code enrols without a provider round-trip",
    fullyDiscounted.ok && "enrolledFree" in fullyDiscounted.data,
    fullyDiscounted.ok ? Object.keys(fullyDiscounted.data).join(",") : `${fullyDiscounted.error}`);

  const zeroPayment = await prisma.payment.findFirst({
    where: { userId: other.id, courseId: course.id },
    select: { amountMinor: true, discountMinor: true, status: true, enrollmentId: true },
  });
  check("the zero-value payment is still recorded and settled",
    zeroPayment?.amountMinor === 0 && zeroPayment.status === "SUCCESSFUL" && zeroPayment.enrollmentId !== null,
    `${zeroPayment?.amountMinor}, ${zeroPayment?.status}`);
  const freebieRedemptions = await prisma.couponRedemption.count({
    where: { couponId: freebie.ok ? freebie.id : "" },
  });
  check("a 100% code is still redeemed", freebieRedemptions === 1, `${freebieRedemptions} redemption(s)`);

  // --- the race -----------------------------------------------------------
  const limited = await createCoupon(
    { code: `RACE${RUN}`, type: "PERCENT", value: 10, maxRedemptions: 1, perUserLimit: 5 },
    teacher.id,
  );
  if (!limited.ok) return finish();
  createdCoupons.push(limited.id);

  // Real payment rows, because paymentId is a uuid foreign key — a synthetic
  // string would error out and never exercise the race at all.
  const racePayments = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.payment.create({
        data: {
          userId: buyer.id, courseId: course.id, provider: "PAYSTACK",
          reference: `CS-RACE-${RUN}-${i}`, status: "PENDING",
          amountMinor: 1000, currency: "NGN",
        },
        select: { id: true },
      }),
    ),
  );

  // Five simultaneous redemptions against a code with one use left.
  const attempts = await Promise.all(
    racePayments.map((payment) =>
      redeemCoupon(limited.id, buyer.id, 1000, payment.id).catch(() => ({
        ok: false as const, reason: "EXHAUSTED" as const,
      })),
    ),
  );
  const succeeded = attempts.filter((a) => a.ok).length;
  const finalCount = await prisma.coupon.findUniqueOrThrow({
    where: { id: limited.id },
    select: { redemptionCount: true },
  });

  const raceRedemptions = await prisma.couponRedemption.count({ where: { couponId: limited.id } });
  check("concurrent redemptions cannot oversell a limited code",
    finalCount.redemptionCount === 1 && raceRedemptions === 1,
    `${succeeded} reported ok, count=${finalCount.redemptionCount}, rows=${raceRedemptions}`);

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
