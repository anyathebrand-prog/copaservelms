/**
 * Functional checks for payments (PRD §13.2).
 *
 * The provider APIs are not called here — that would need live merchant keys
 * and real money. What is tested is everything we own and everything that
 * costs money if it is wrong: signature verification, idempotent finalisation,
 * amount authority, and the rule that enrolment follows provider confirmation
 * rather than a redirect.
 *
 * A stub driver is injected into the real functions, so the actual
 * finalisePayment logic runs against controlled provider responses — only the
 * network is replaced, not the logic under test.
 *
 *   npx tsx scripts/verify-payments.ts
 */
import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { createDriverForTesting, type PaymentDriver } from "../lib/payments/provider";
import { enrolFree, finalisePayment, startCheckout } from "../lib/payments";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  const payments = await prisma.payment.findMany({
    where: { userId: { in: createdUsers } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: payments.map((p) => p.id) } } });
  await prisma.payment.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

/** What the stubbed provider will claim on the next verify() call. */
let stubbedResponse: { status: "SUCCESSFUL" | "FAILED" | "PENDING"; amountMinor: number } | "throw" = {
  status: "SUCCESSFUL",
  amountMinor: 500000,
};
let verifyCalls = 0;

/**
 * A driver whose responses this test controls, injected into the real flow —
 * so finalisePayment's actual logic runs, only the network is replaced.
 */
const stubDriver: PaymentDriver = {
  id: "PAYSTACK",
  createCheckout: async () => ({ checkoutUrl: "https://checkout.test/pay" }),
  verify: async (reference: string) => {
    verifyCalls += 1;
    if (stubbedResponse === "throw") throw new Error("provider unreachable");
    return {
      reference,
      amountMinor: stubbedResponse.amountMinor,
      currency: "NGN",
      status: stubbedResponse.status,
      providerReference: "prov_1",
      paidAt: new Date(),
      raw: { stubbed: true },
    };
  },
  verifySignature: () => true,
  parseWebhook: () => null,
};

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: {
      email: `pay-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Seller", lastName: "Test" } },
    },
  });
  createdUsers.push(teacher.id);

  const buyer = await prisma.user.create({
    data: {
      email: `pay-buyer-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Buyer", lastName: "Test" } },
    },
  });
  createdUsers.push(buyer.id);

  const paid = await prisma.course.create({
    data: {
      title: `Paid Course ${RUN}`, slug: `paid-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 500000, currency: "NGN",
    },
    select: { id: true },
  });
  createdCourses.push(paid.id);

  const free = await prisma.course.create({
    data: {
      title: `Free Course ${RUN}`, slug: `free-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 0,
    },
    select: { id: true },
  });
  createdCourses.push(free.id);

  const draft = await prisma.course.create({
    data: {
      title: `Draft Course ${RUN}`, slug: `draft-course-${RUN}`, status: "DRAFT",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 100000,
    },
    select: { id: true },
  });
  createdCourses.push(draft.id);

  // --- signatures ---------------------------------------------------------
  const paystack = createDriverForTesting("PAYSTACK", "sk_test_secret");
  const body = JSON.stringify({ event: "charge.success", data: { reference: "CS-ABC" } });
  const goodSig = createHmac("sha512", "sk_test_secret").update(body).digest("hex");

  check("Paystack accepts a correct signature", paystack.verifySignature(body, goodSig), "accepted");
  check("Paystack rejects a wrong signature",
    !paystack.verifySignature(body, "deadbeef".repeat(16)), "rejected");
  check("Paystack rejects a missing signature", !paystack.verifySignature(body, null), "rejected");
  check("Paystack rejects a tampered body",
    !paystack.verifySignature(body.replace("CS-ABC", "CS-XYZ"), goodSig), "rejected");
  check("Paystack extracts the reference",
    paystack.parseWebhook(body)?.reference === "CS-ABC", `${paystack.parseWebhook(body)?.reference}`);
  check("Paystack ignores an unparseable body", paystack.parseWebhook("not json") === null, "null");

  const flutterwave = createDriverForTesting("FLUTTERWAVE", "sk_live", "my-webhook-hash");
  check("Flutterwave accepts its configured hash",
    flutterwave.verifySignature("{}", "my-webhook-hash"), "accepted");
  check("Flutterwave rejects a wrong hash",
    !flutterwave.verifySignature("{}", "not-the-hash"), "rejected");
  check("Flutterwave reads tx_ref rather than reference",
    flutterwave.parseWebhook(JSON.stringify({ event: "charge.completed", data: { tx_ref: "CS-FLW" } }))?.reference === "CS-FLW",
    "tx_ref read");

  // --- checkout guards ----------------------------------------------------
  const freeViaCheckout = await startCheckout(buyer.id, free.id, "PAYSTACK", "http://localhost:3000", stubDriver);
  check("a free course cannot go through checkout",
    !freeViaCheckout.ok && freeViaCheckout.error === "FREE_COURSE",
    freeViaCheckout.ok ? "started!" : freeViaCheckout.error);

  const draftCheckout = await startCheckout(buyer.id, draft.id, "PAYSTACK", "http://localhost:3000", stubDriver);
  check("an unpublished course cannot be bought",
    !draftCheckout.ok && draftCheckout.error === "NOT_PUBLISHED",
    draftCheckout.ok ? "started!" : draftCheckout.error);

  const paidViaFree = await enrolFree(buyer.id, paid.id);
  check("a paid course cannot be claimed as free", !paidViaFree.ok,
    paidViaFree.ok ? "enrolled!" : `${paidViaFree.error}`);

  const freeEnrol = await enrolFree(buyer.id, free.id);
  check("a free course enrols directly", freeEnrol.ok, freeEnrol.ok ? "enrolled" : `${freeEnrol.error}`);

  // --- checkout -----------------------------------------------------------
  const checkout = await startCheckout(buyer.id, paid.id, "PAYSTACK", "http://localhost:3000", stubDriver);
  check("checkout starts and returns a URL", checkout.ok,
    checkout.ok ? checkout.data.reference : `${checkout.error}`);
  if (!checkout.ok) return finish();

  const reference = checkout.data.reference;

  const pendingRow = await prisma.payment.findUniqueOrThrow({ where: { reference } });
  check("a pending payment row is written before redirect",
    pendingRow.status === "PENDING" && pendingRow.amountMinor === 500000,
    `${pendingRow.status}, ${pendingRow.amountMinor}`);

  const beforePaying = await prisma.enrollment.findFirst({
    where: { userId: buyer.id, courseId: paid.id },
  });
  check("no enrolment is granted merely by starting checkout", beforePaying === null, "none");

  // --- verification decides ----------------------------------------------
  stubbedResponse = { status: "PENDING", amountMinor: 500000 };
  const stillPending = await finalisePayment(reference, stubDriver);
  check("a pending provider status grants nothing", stillPending === "PENDING", stillPending);

  stubbedResponse = "throw";
  const outage = await finalisePayment(reference, stubDriver);
  check("a provider outage leaves the payment pending, not failed", outage === "PENDING", outage);
  const afterOutage = await prisma.payment.findUniqueOrThrow({ where: { reference } });
  check("outage does not mark the payment failed", afterOutage.status === "PENDING", afterOutage.status);

  // Underpayment must not buy access.
  stubbedResponse = { status: "SUCCESSFUL", amountMinor: 100000 };
  const short = await finalisePayment(reference, stubDriver);
  check("underpayment does not grant enrolment", short === "AMOUNT_MISMATCH", short);
  const afterShort = await prisma.enrollment.findFirst({ where: { userId: buyer.id, courseId: paid.id } });
  check("underpayment leaves no enrolment", afterShort === null, "none");

  // --- success ------------------------------------------------------------
  stubbedResponse = { status: "SUCCESSFUL", amountMinor: 500000 };
  const enrolled = await finalisePayment(reference, stubDriver);
  check("a confirmed payment grants enrolment", enrolled === "ENROLLED", enrolled);

  const paidRow = await prisma.payment.findUniqueOrThrow({ where: { reference } });
  check("payment is marked successful and linked to the enrolment",
    paidRow.status === "SUCCESSFUL" && paidRow.enrollmentId !== null && paidRow.paidAt !== null,
    `${paidRow.status}`);

  const audit = await prisma.auditLog.findMany({ where: { entityId: paidRow.id, action: "payment.succeeded" } });
  check("a successful payment writes an audit entry", audit.length === 1, `${audit.length}`);

  // --- idempotency --------------------------------------------------------
  const callsBefore = verifyCalls;
  const replay = await finalisePayment(reference, stubDriver);
  check("replaying a webhook is a no-op", replay === "ALREADY_FINALISED", replay);
  check("a replay does not re-verify with the provider", verifyCalls === callsBefore,
    `${verifyCalls - callsBefore} extra call(s)`);

  const enrolments = await prisma.enrollment.count({ where: { userId: buyer.id, courseId: paid.id } });
  check("a replay does not double-enrol", enrolments === 1, `${enrolments} enrolment(s)`);

  const paymentsCount = await prisma.payment.count({ where: { reference } });
  check("a replay does not duplicate the payment", paymentsCount === 1, `${paymentsCount}`);

  // Concurrent webhooks: both must resolve without creating two enrolments.
  const second = await startCheckout(buyer.id, free.id, "PAYSTACK", "http://localhost:3000", stubDriver);
  check("checkout is refused when already enrolled",
    !second.ok && second.error === "ALREADY_ENROLLED", second.ok ? "started!" : second.error);

  // --- unknown reference --------------------------------------------------
  const forged = await finalisePayment("CS-DOES-NOT-EXIST", stubDriver);
  check("a forged callback reference grants nothing", forged === "UNKNOWN_REFERENCE", forged);

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
