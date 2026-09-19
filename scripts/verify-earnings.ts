/**
 * The instructor revenue share, checked against the real database.
 *
 * Money, so every rule gets a case: the 70/30 split and its rounding, the
 * 30-day hold, the ₦20,000 minimum, one earning per payment however many times
 * it is confirmed, refunds before and after payout, and payouts that cannot
 * double-count a sale.
 *
 * Payments are confirmed through the real finalisePayment, with a stand-in
 * gateway so no card is charged. Everything this creates is removed at the end.
 *
 *   npx tsx --env-file=.env scripts/verify-earnings.ts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";
import { finalisePayment } from "../lib/payments";
import type { PaymentDriver } from "../lib/payments/provider";
import {
  HOLD_DAYS,
  INSTRUCTOR_SHARE_BPS,
  MIN_PAYOUT_MINOR,
  cancelPayout,
  createPayout,
  getBalance,
  markPayoutPaid,
  recordRefund,
  savePayoutAccount,
  split,
} from "../lib/earnings";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: string[] = [];
const check = (n: string, p: boolean, d = "") =>
  results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

const DAY = 24 * 60 * 60 * 1000;
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

/** A gateway that says every payment went through, for exactly what was asked. */
function paidDriver(amountMinor: number, paidAt: Date): PaymentDriver {
  return {
    id: "KORA",
    createCheckout: async () => ({ checkoutUrl: "" }),
    verify: async (reference) => ({
      reference, amountMinor, currency: "NGN", status: "SUCCESSFUL",
      providerReference: null, paidAt, raw: { test: true },
    }),
    verifySignature: () => true,
    parseWebhook: () => null,
  };
}

const createdAuth: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

async function makeUser(label: string) {
  const email = `earn-${label}-${randomUUID().slice(0, 6)}@copaserve.com.ng`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: `Pw-${randomUUID()}`, email_confirm: true,
    user_metadata: { first_name: label, last_name: "Probe" },
  });
  if (error) throw error;
  createdAuth.push(data.user.id);
  // The app row is created by a trigger on the auth row; wait for it.
  for (let i = 0; i < 20; i++) {
    const user = await prisma.user.findFirst({ where: { supabaseUserId: data.user.id }, select: { id: true } });
    if (user) { createdUsers.push(user.id); return user.id; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no app user for ${email}`);
}

async function sell(learnerId: string, courseId: string, amountMinor: number, paidAt: Date) {
  const reference = `EARN-TEST-${randomUUID()}`;
  await prisma.payment.create({
    data: { userId: learnerId, courseId, provider: "KORA", reference, amountMinor, currency: "NGN" },
  });
  const outcome = await finalisePayment(reference, paidDriver(amountMinor, paidAt));
  const payment = await prisma.payment.findUnique({ where: { reference }, select: { id: true } });
  return { reference, paymentId: payment!.id, outcome };
}

async function main() {
  const instructorId = await makeUser("instructor");
  const learnerId = await makeUser("learner");
  const learner2Id = await makeUser("learner2");
  const learner3Id = await makeUser("learner3");

  const course = await prisma.course.create({
    data: {
      title: `Earnings test ${randomUUID().slice(0, 6)}`,
      slug: `earnings-test-${randomUUID().slice(0, 8)}`,
      instructorId,
      priceMinor: 5_000_000,
      status: "DRAFT",
    },
    select: { id: true },
  });
  createdCourses.push(course.id);

  // --- the split --------------------------------------------------------------------
  check("the split is 70% to the instructor", INSTRUCTOR_SHARE_BPS === 7000);
  check("₦50,000 splits ₦35,000 / ₦15,000",
    split(5_000_000).shareMinor === 3_500_000 && split(5_000_000).platformMinor === 1_500_000);
  const odd = split(12_345);
  check("rounding never overpays the instructor", odd.shareMinor === 8_641 && odd.platformMinor === 3_704,
    `${odd.shareMinor} + ${odd.platformMinor} of 12345`);
  check("and nothing is lost to rounding", odd.shareMinor + odd.platformMinor === 12_345);

  // --- a sale -----------------------------------------------------------------------
  const now = new Date();
  const sale1 = await sell(learnerId, course.id, 5_000_000, now);
  check("a paid course enrols the learner", sale1.outcome === "ENROLLED", sale1.outcome);

  const earning1 = await prisma.instructorEarning.findFirst({
    where: { paymentId: sale1.paymentId, kind: "SALE" },
    select: { id: true, shareMinor: true, platformMinor: true, status: true, availableAt: true },
  });
  check("and credits the instructor 70%", earning1?.shareMinor === 3_500_000, naira(earning1?.shareMinor ?? 0));
  const holdDays = earning1 ? Math.round((earning1.availableAt.getTime() - now.getTime()) / DAY) : -1;
  check(`held for ${HOLD_DAYS} days`, holdDays === HOLD_DAYS, `${holdDays} days`);

  // Confirmed again — a second webhook, a retried callback.
  const again = await finalisePayment(sale1.reference, paidDriver(5_000_000, now));
  const count = await prisma.instructorEarning.count({ where: { paymentId: sale1.paymentId, kind: "SALE" } });
  check("confirming the same payment twice credits once", count === 1 && again === "ALREADY_FINALISED", `${count} earnings, ${again}`);

  // --- the hold ---------------------------------------------------------------------
  let balance = await getBalance(instructorId);
  check("while held, nothing is available", balance.heldMinor === 3_500_000 && balance.availableMinor === 0,
    `held ${naira(balance.heldMinor)}, available ${naira(balance.availableMinor)}`);
  // With bank details present, so the refusal can only be the hold — without
  // them this would be refused for the wrong reason and prove nothing.
  await savePayoutAccount(instructorId, { bankName: "GTBank", accountNumber: "0123456789", accountName: "Probe Instructor" });
  const early = await createPayout(instructorId, instructorId);
  check("and no payout can be made — because of the hold", !early.ok && early.error === "BELOW_MINIMUM",
    early.ok ? "paid out" : `${early.error}: ${early.detail}`);
  await prisma.payoutAccount.deleteMany({ where: { userId: instructorId } });

  // Pass the hold by moving the date, as 30 days would.
  await prisma.instructorEarning.update({ where: { id: earning1!.id }, data: { availableAt: new Date(Date.now() - DAY) } });
  balance = await getBalance(instructorId);
  check("after the hold it is available", balance.availableMinor === 3_500_000 && balance.payable,
    naira(balance.availableMinor));

  // --- bank details -----------------------------------------------------------------
  const noAccount = await createPayout(instructorId, instructorId);
  check("no payout without bank details", !noAccount.ok && noAccount.error === "NO_ACCOUNT");
  const short = await savePayoutAccount(instructorId, { bankName: "GTBank", accountNumber: "012345678", accountName: "Probe Instructor" });
  check("a 9-digit account number is refused", !short.ok);
  const saved = await savePayoutAccount(instructorId, { bankName: "GTBank", accountNumber: "0123456789", accountName: "Probe Instructor" });
  check("a 10-digit NUBAN is accepted", saved.ok);

  // --- a payout ---------------------------------------------------------------------
  const payout = await createPayout(instructorId, instructorId);
  check("a payout gathers the available balance", payout.ok && payout.data.amountMinor === 3_500_000,
    payout.ok ? naira(payout.data.amountMinor) : payout.detail);
  const twice = await createPayout(instructorId, instructorId);
  check("the same earnings cannot go into a second payout", !twice.ok, twice.ok ? "second payout made" : twice.detail);

  if (payout.ok) {
    const noRef = await markPayoutPaid(payout.data.id, "   ", instructorId);
    check("marking paid needs the transfer reference", !noRef.ok);
    const paid = await markPayoutPaid(payout.data.id, "GTB-TRF-12345", instructorId);
    check("marked paid with a reference", paid.ok);
    balance = await getBalance(instructorId);
    check("the balance shows it paid", balance.paidMinor === 3_500_000 && balance.availableMinor === 0,
      `paid ${naira(balance.paidMinor)}`);
    const snapshot = await prisma.instructorPayout.findUnique({ where: { id: payout.data.id }, select: { accountNumber: true } });
    await savePayoutAccount(instructorId, { bankName: "Access", accountNumber: "9999999999", accountName: "Probe Instructor" });
    const after = await prisma.instructorPayout.findUnique({ where: { id: payout.data.id }, select: { accountNumber: true } });
    check("changing bank details later does not rewrite where a payout went",
      snapshot?.accountNumber === "0123456789" && after?.accountNumber === "0123456789");
  }

  // --- a refund after payout --------------------------------------------------------
  const overRefund = await recordRefund(sale1.paymentId, 5_000_001, instructorId, "test");
  check("refunding more than was paid is refused", !overRefund.ok);
  const lateRefund = await recordRefund(sale1.paymentId, 5_000_000, instructorId, "chargeback");
  check("a refund after payout is recorded", lateRefund.ok);
  balance = await getBalance(instructorId);
  check("and deducted from what comes next", balance.availableMinor === -3_500_000,
    `available ${naira(balance.availableMinor)}`);
  const refundedPayment = await prisma.payment.findUnique({ where: { id: sale1.paymentId }, select: { status: true, refundedMinor: true } });
  check("the payment is marked refunded", refundedPayment?.status === "REFUNDED" && refundedPayment.refundedMinor === 5_000_000);

  // --- a refund inside the hold --------------------------------------------------------
  const sale2 = await sell(learner2Id, course.id, 5_000_000, new Date());
  const inHold = await recordRefund(sale2.paymentId, 5_000_000, instructorId, "changed their mind");
  const voided = await prisma.instructorEarning.findFirst({ where: { paymentId: sale2.paymentId, kind: "SALE" }, select: { status: true } });
  check("a full refund inside the hold voids the sale", inHold.ok && voided?.status === "VOID", voided?.status);
  check("with no deduction created", (await prisma.instructorEarning.count({ where: { paymentId: sale2.paymentId, kind: "REFUND" } })) === 0);

  const sale3 = await sell(learner3Id, course.id, 5_000_000, new Date());
  await recordRefund(sale3.paymentId, 1_000_000, instructorId, "partial");
  const reduced = await prisma.instructorEarning.findFirst({ where: { paymentId: sale3.paymentId, kind: "SALE" }, select: { status: true, grossMinor: true, shareMinor: true } });
  check("a partial refund inside the hold reduces the sale", reduced?.status === "OPEN" && reduced.grossMinor === 4_000_000 && reduced.shareMinor === 2_800_000,
    `${naira(reduced?.grossMinor ?? 0)} → share ${naira(reduced?.shareMinor ?? 0)}`);

  // --- the minimum, and a debt ------------------------------------------------------------
  // sale3 (₦28,000 share) matures; the earlier chargeback (−₦35,000) is still owed.
  await prisma.instructorEarning.updateMany({ where: { paymentId: sale3.paymentId, kind: "SALE" }, data: { availableAt: new Date(Date.now() - DAY) } });
  balance = await getBalance(instructorId);
  check("a refund owed is netted before anything is paid", balance.availableMinor === 2_800_000 - 3_500_000 && !balance.payable,
    `available ${naira(balance.availableMinor)}`);
  const inDebt = await createPayout(instructorId, instructorId);
  check("so no payout is made while it is owed", !inDebt.ok);

  // --- cancelling ------------------------------------------------------------------------
  // Clear the debt so a payout is possible, then cancel one.
  await prisma.instructorEarning.updateMany({ where: { instructorId, kind: "REFUND" }, data: { status: "VOID" } });
  const toCancel = await createPayout(instructorId, instructorId);
  check("with the debt cleared, ₦28,000 is payable", toCancel.ok && toCancel.data.amountMinor === 2_800_000,
    toCancel.ok ? naira(toCancel.data.amountMinor) : toCancel.detail);
  if (toCancel.ok) {
    await cancelPayout(toCancel.data.id, instructorId);
    balance = await getBalance(instructorId);
    check("a cancelled payout returns its earnings to available", balance.availableMinor === 2_800_000);
  }

  // --- below the minimum -------------------------------------------------------------------
  check(`the minimum is ${naira(MIN_PAYOUT_MINOR)}`, MIN_PAYOUT_MINOR === 2_000_000);
  await prisma.instructorEarning.updateMany({ where: { paymentId: sale3.paymentId, kind: "SALE" }, data: { shareMinor: 1_999_999 } });
  const below = await createPayout(instructorId, instructorId);
  check("₦1 under the minimum is refused", !below.ok && below.error === "BELOW_MINIMUM", below.ok ? "paid" : below.detail);
}

async function cleanup() {
  const payments = await prisma.payment.findMany({ where: { courseId: { in: createdCourses } }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  await prisma.instructorEarning.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.instructorPayout.deleteMany({ where: { instructorId: { in: createdUsers } } });
  await prisma.payoutAccount.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUsers } }, { entityId: { in: paymentIds } }] } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.enrollment.deleteMany({ where: { courseId: { in: createdCourses } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  for (const id of createdUsers) {
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.consentLog.deleteMany({ where: { userId: id } });
    await prisma.userRole.deleteMany({ where: { userId: id } });
    await prisma.profile.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  for (const id of createdAuth) await admin.auth.admin.deleteUser(id);
}

main()
  .catch((e) => {
    console.error(e);
    check("the run completed", false, String(e).slice(0, 200));
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(results.join("\n"));
    const passed = results.filter((r) => r.startsWith("PASS")).length;
    console.log(`\n${passed}/${results.length} passed`);
    await prisma.$disconnect();
    process.exit(passed === results.length ? 0 : 1);
  });
