/**
 * Functional checks for corporate invoicing (PRD §13.2).
 *
 * The property under test is that an issued invoice is frozen. Once a document
 * has left the building a customer may be holding a printout and their finance
 * team may have raised a purchase order against it, so anything that could let
 * two different invoices share one number, or let a paid invoice quietly become
 * unpaid, is the failure that matters here.
 *
 * Money is checked arithmetically rather than assumed: totals are recomputed
 * from the lines by the library, and a caller supplying its own total should
 * not be able to change what is billed.
 *
 *   npx tsx --env-file=.env scripts/verify-invoices.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  cancelInvoice,
  createDraft,
  deleteDraft,
  getInvoice,
  getInvoiceSummary,
  issueInvoice,
  listInvoices,
  markPaid,
} from "../lib/invoices";
import { renderInvoicePdf } from "../lib/invoices/pdf";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdInvoices: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.invoice.deleteMany({ where: { id: { in: createdInvoices } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: createdOrgs } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgs } } });
}

async function main() {
  const admin = await prisma.user.create({
    data: { email: `inv-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Inv", lastName: "Admin" } } },
  });
  createdUsers.push(admin.id);

  const org = await prisma.organization.create({
    data: { name: `Zenith ${RUN}`, slug: `zenith-${RUN}`, contactEmail: `finance-${RUN}@zenith.test` },
    select: { id: true, name: true },
  });
  createdOrgs.push(org.id);

  // --- validation ----------------------------------------------------------
  const noLines = await createDraft({ organizationId: org.id, lines: [] }, admin.id);
  check("an invoice needs at least one line", !noLines.ok, noLines.ok ? "created!" : noLines.detail ?? "");

  const blankDescription = await createDraft(
    { organizationId: org.id, lines: [{ description: "  ", quantity: 1, unitAmountMinor: 100 }] },
    admin.id,
  );
  check("a line needs a description", !blankDescription.ok,
    blankDescription.ok ? "created!" : blankDescription.detail ?? "");

  const zeroQty = await createDraft(
    { organizationId: org.id, lines: [{ description: "Seats", quantity: 0, unitAmountMinor: 100 }] },
    admin.id,
  );
  check("a quantity below one is refused", !zeroQty.ok, zeroQty.ok ? "created!" : zeroQty.detail ?? "");

  const negative = await createDraft(
    { organizationId: org.id, lines: [{ description: "Seats", quantity: 1, unitAmountMinor: -500 }] },
    admin.id,
  );
  check("a negative price is refused", !negative.ok, negative.ok ? "created!" : negative.detail ?? "");

  const missingOrg = await createDraft(
    { organizationId: crypto.randomUUID(), lines: [{ description: "Seats", quantity: 1, unitAmountMinor: 1 }] },
    admin.id,
  );
  check("an invoice for a customer that does not exist is refused",
    !missingOrg.ok && missingOrg.error === "NOT_FOUND", missingOrg.ok ? "created!" : missingOrg.error);

  const overDiscount = await createDraft(
    {
      organizationId: org.id,
      lines: [{ description: "Seats", quantity: 1, unitAmountMinor: 100_00 }],
      discountMinor: 200_00,
    },
    admin.id,
  );
  check("a discount larger than the subtotal is refused", !overDiscount.ok,
    overDiscount.ok ? "created!" : overDiscount.detail ?? "");

  // --- the arithmetic -------------------------------------------------------
  const draft = await createDraft(
    {
      organizationId: org.id,
      lines: [
        { description: "NDPA Practitioner — seats", quantity: 40, unitAmountMinor: 25_000_00 },
        { description: "Onboarding workshop", quantity: 1, unitAmountMinor: 150_000_00 },
        { description: "Bundled support", quantity: 1, unitAmountMinor: 0 },
      ],
      discountMinor: 100_000_00,
      notes: `PO-${RUN}`,
      dueAt: new Date(Date.now() + 30 * 86_400_000),
    },
    admin.id,
  );
  check("a draft is created", draft.ok, draft.ok ? draft.data.id : draft.error);
  if (!draft.ok) return finish();
  createdInvoices.push(draft.data.id);

  const created = await getInvoice(draft.data.id);
  check("the subtotal is computed from the lines",
    created?.subtotalMinor === 40 * 25_000_00 + 150_000_00,
    `${(created?.subtotalMinor ?? 0) / 100}`);
  check("the discount comes off the total",
    created?.totalMinor === (created?.subtotalMinor ?? 0) - 100_000_00,
    `${(created?.totalMinor ?? 0) / 100}`);
  check("a zero-priced line is kept rather than dropped",
    created?.lines.length === 3, `${created?.lines.length} lines`);
  check("each line stores its own extended amount",
    created?.lines[0]?.amountMinor === 40 * 25_000_00, `${(created?.lines[0]?.amountMinor ?? 0) / 100}`);

  check("the customer name is copied onto the invoice",
    created?.billToName === org.name, created?.billToName ?? "");
  check("a draft has no number yet", created?.invoiceNumber === null, `${created?.invoiceNumber}`);
  check("a draft is not issued", created?.status === "DRAFT", created?.status ?? "");

  // A rename must not rewrite a document already sent.
  await prisma.organization.update({ where: { id: org.id }, data: { name: `Renamed ${RUN}` } });
  const afterRename = await getInvoice(draft.data.id);
  check("renaming the customer does not rewrite the invoice",
    afterRename?.billToName === org.name, afterRename?.billToName ?? "");

  // --- payment before issue -------------------------------------------------
  const earlyPay = await markPaid(draft.data.id, { paymentReference: "TRF-1" }, admin.id);
  check("a draft cannot be marked paid",
    !earlyPay.ok && earlyPay.error === "NOT_ISSUED", earlyPay.ok ? "paid!" : earlyPay.error);

  // --- issuing --------------------------------------------------------------
  const issued = await issueInvoice(draft.data.id, admin.id);
  check("a draft can be issued", issued.ok, issued.ok ? issued.data.invoiceNumber : issued.error);
  if (!issued.ok) return finish();

  check("issuing assigns a number in the INV-YYYY-NNNNNN pattern",
    /^INV-\d{4}-\d{6}$/.test(issued.data.invoiceNumber), issued.data.invoiceNumber);

  const reissue = await issueInvoice(draft.data.id, admin.id);
  check("an issued invoice cannot be issued again",
    !reissue.ok && reissue.error === "NOT_DRAFT", reissue.ok ? "issued twice!" : reissue.error);

  const deleteIssued = await deleteDraft(draft.data.id);
  check("an issued invoice cannot be deleted",
    !deleteIssued.ok && deleteIssued.error === "NOT_DRAFT",
    deleteIssued.ok ? "deleted!" : deleteIssued.error);

  // --- numbering is sequential and gapless ----------------------------------
  const second = await createDraft(
    { organizationId: org.id, lines: [{ description: "Seats", quantity: 2, unitAmountMinor: 5_000_00 }] },
    admin.id,
  );
  if (!second.ok) return finish();
  createdInvoices.push(second.data.id);

  const abandoned = await createDraft(
    { organizationId: org.id, lines: [{ description: "Never sent", quantity: 1, unitAmountMinor: 100 }] },
    admin.id,
  );
  if (!abandoned.ok) return finish();
  const dropped = await deleteDraft(abandoned.data.id);
  check("an unissued draft can be deleted", dropped.ok, dropped.ok ? "deleted" : dropped.error);

  const secondIssued = await issueInvoice(second.data.id, admin.id);
  check("an abandoned draft leaves no gap in the sequence",
    secondIssued.ok &&
      Number(secondIssued.data.invoiceNumber.slice(-6)) ===
        Number(issued.data.invoiceNumber.slice(-6)) + 1,
    secondIssued.ok ? secondIssued.data.invoiceNumber : secondIssued.error);

  // --- payment --------------------------------------------------------------
  const noReference = await markPaid(draft.data.id, { paymentReference: "   " }, admin.id);
  check("marking paid requires a bank reference", !noReference.ok,
    noReference.ok ? "paid!" : noReference.detail ?? "");

  const paid = await markPaid(draft.data.id, { paymentReference: `TRF-${RUN}` }, admin.id);
  check("an issued invoice can be marked paid", paid.ok, paid.ok ? "paid" : paid.error);

  const paidRow = await getInvoice(draft.data.id);
  check("payment records the reference and the date",
    paidRow?.paymentReference === `TRF-${RUN}` && paidRow.paidAt !== null, "recorded");

  const payTwice = await markPaid(draft.data.id, { paymentReference: "TRF-again" }, admin.id);
  check("a paid invoice cannot be paid twice",
    !payTwice.ok && payTwice.error === "ALREADY_PAID", payTwice.ok ? "paid twice!" : payTwice.error);

  const cancelPaid = await cancelInvoice(draft.data.id, "changed our minds", admin.id);
  check("a paid invoice cannot be cancelled, since that would lose the payment",
    !cancelPaid.ok && cancelPaid.error === "ALREADY_PAID",
    cancelPaid.ok ? "cancelled!" : cancelPaid.error);

  // --- cancelling -----------------------------------------------------------
  const noReason = await cancelInvoice(second.data.id, "  ", admin.id);
  check("cancelling requires a reason", !noReason.ok, noReason.ok ? "cancelled!" : noReason.detail ?? "");

  const cancelled = await cancelInvoice(second.data.id, `duplicate of ${issued.data.invoiceNumber}`, admin.id);
  check("an issued invoice can be cancelled", cancelled.ok, cancelled.ok ? "cancelled" : cancelled.error);

  const cancelledRow = await getInvoice(second.data.id);
  check("a cancelled invoice keeps its number rather than freeing it",
    cancelledRow?.invoiceNumber === (secondIssued.ok ? secondIssued.data.invoiceNumber : ""),
    cancelledRow?.invoiceNumber ?? "");
  check("cancelling records the reason",
    (cancelledRow?.cancelReason ?? "").includes("duplicate"), cancelledRow?.cancelReason ?? "");

  // --- the audit trail ------------------------------------------------------
  const audited = await prisma.auditLog.count({
    where: { actorId: admin.id, action: { in: ["invoice.issue", "invoice.paid", "invoice.cancel"] } },
  });
  check("issue, payment and cancellation are all audited", audited >= 4, `${audited} entries`);

  // --- reporting ------------------------------------------------------------
  const summary = await getInvoiceSummary();
  check("the summary counts paid revenue", summary.paidMinor >= (paidRow?.totalMinor ?? 0),
    `${summary.paidMinor / 100}`);

  const listed = await listInvoices(org.id);
  check("invoices are listed for their customer", listed.length === 2, `${listed.length}`);

  // --- the document ---------------------------------------------------------
  const pdf = await renderInvoicePdf(draft.data.id);
  check("an invoice renders as a PDF", pdf !== null && pdf.length > 1000, `${pdf?.length ?? 0} bytes`);
  check("the PDF is a real PDF",
    pdf !== null && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-", "header present");

  const missingPdf = await renderInvoicePdf(crypto.randomUUID());
  check("rendering an invoice that does not exist returns nothing rather than throwing",
    missingPdf === null, "null");

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
