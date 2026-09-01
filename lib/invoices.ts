import { prisma } from "@/lib/prisma";

/**
 * Corporate invoicing (PRD §13.2).
 *
 * Card checkout serves individual learners. An institution buying training for
 * two hundred staff will not put it on a card: it wants a document to raise a
 * purchase order against, pays by bank transfer, and expects the transfer to be
 * reconciled against what it was quoted. That is the flow this file implements,
 * and it is the half of §7.2's corporate story that was missing — organisations,
 * departments, cohorts and bulk enrolment all existed with no way to bill for
 * any of it.
 *
 * The rule that shapes everything here: **an issued invoice is frozen**. Once a
 * document has left the building, a customer may be holding a printout, their
 * finance team may have raised a PO against it, and a silent edit would mean
 * two different invoices share one number. So edits are confined to drafts, and
 * a mistake after issue is corrected by cancelling and raising a new one.
 */

export type InvoiceError =
  | "NOT_FOUND"
  | "INVALID"
  | "NOT_DRAFT"
  | "NOT_ISSUED"
  | "ALREADY_PAID";

export type Result<T> = { ok: true; data: T } | { ok: false; error: InvoiceError; detail?: string };

export type LineInput = {
  description: string;
  courseId?: string | null;
  quantity: number;
  unitAmountMinor: number;
};

/** Totals are computed here and never accepted from a caller. */
function totalsFor(lines: LineInput[], discountMinor: number) {
  const subtotalMinor = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitAmountMinor,
    0,
  );
  return { subtotalMinor, totalMinor: Math.max(0, subtotalMinor - discountMinor) };
}

function validateLines(lines: LineInput[]): string | null {
  if (lines.length === 0) return "An invoice needs at least one line.";

  for (const line of lines) {
    if (!line.description.trim()) return "Every line needs a description.";
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return "Quantity must be a whole number of one or more.";
    }
    // Zero is allowed: a bundled or waived item still belongs on the document,
    // and hiding it would make the total look wrong.
    if (!Number.isInteger(line.unitAmountMinor) || line.unitAmountMinor < 0) {
      return "A unit price cannot be negative.";
    }
  }

  return null;
}

export async function createDraft(
  input: {
    organizationId: string;
    lines: LineInput[];
    discountMinor?: number;
    notes?: string | null;
    dueAt?: Date | null;
  },
  actorId: string,
): Promise<Result<{ id: string }>> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true, contactEmail: true },
  });
  if (!organization) return { ok: false, error: "NOT_FOUND" };

  const problem = validateLines(input.lines);
  if (problem) return { ok: false, error: "INVALID", detail: problem };

  const discountMinor = Math.max(0, input.discountMinor ?? 0);
  const { subtotalMinor, totalMinor } = totalsFor(input.lines, discountMinor);

  if (discountMinor > subtotalMinor) {
    return { ok: false, error: "INVALID", detail: "The discount is larger than the subtotal." };
  }

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: input.organizationId,
      // Captured now, so a customer renaming itself later does not rewrite an
      // invoice it has already been sent.
      billToName: organization.name,
      billToEmail: organization.contactEmail,
      subtotalMinor,
      discountMinor,
      totalMinor,
      notes: input.notes?.trim() || null,
      dueAt: input.dueAt ?? null,
      createdById: actorId,
      lines: {
        create: input.lines.map((line, index) => ({
          description: line.description.trim(),
          courseId: line.courseId || null,
          quantity: line.quantity,
          unitAmountMinor: line.unitAmountMinor,
          amountMinor: line.quantity * line.unitAmountMinor,
          position: index,
        })),
      },
    },
    select: { id: true },
  });

  return { ok: true, data: invoice };
}

/**
 * Issue a draft: assign its number and freeze it.
 *
 * The number is assigned here rather than at creation so abandoned drafts do
 * not leave gaps in the sequence — a gap in an invoice run is the kind of thing
 * an auditor asks about, and "we deleted that one" is a poor answer.
 */
export async function issueInvoice(id: string, actorId: string): Promise<Result<{ invoiceNumber: string }>> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true, totalMinor: true },
  });
  if (!invoice) return { ok: false, error: "NOT_FOUND" };
  if (invoice.status !== "DRAFT") return { ok: false, error: "NOT_DRAFT" };

  const invoiceNumber = await nextInvoiceNumber();

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "ISSUED", invoiceNumber, issuedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "invoice.issue",
        entityType: "Invoice",
        entityId: id,
        after: { invoiceNumber, totalMinor: invoice.totalMinor },
      },
    }),
  ]);

  return { ok: true, data: { invoiceNumber } };
}

/**
 * Record that the money arrived.
 *
 * The bank reference is required. Reconciliation is the entire point of this
 * step: an invoice marked paid with nothing to tie it to a bank statement is a
 * claim, not a record.
 */
export async function markPaid(
  id: string,
  input: { paymentReference: string; paidAt?: Date },
  actorId: string,
): Promise<Result<null>> {
  const reference = input.paymentReference.trim();
  if (!reference) {
    return { ok: false, error: "INVALID", detail: "Record the bank reference for the transfer." };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { status: true, invoiceNumber: true, totalMinor: true },
  });
  if (!invoice) return { ok: false, error: "NOT_FOUND" };
  if (invoice.status === "PAID") return { ok: false, error: "ALREADY_PAID" };
  if (invoice.status !== "ISSUED") return { ok: false, error: "NOT_ISSUED" };

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "PAID", paidAt: input.paidAt ?? new Date(), paymentReference: reference },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "invoice.paid",
        entityType: "Invoice",
        entityId: id,
        after: { invoiceNumber: invoice.invoiceNumber, totalMinor: invoice.totalMinor, reference },
      },
    }),
  ]);

  return { ok: true, data: null };
}

/**
 * Cancel an invoice.
 *
 * A paid invoice cannot be cancelled. Reversing money that has arrived is a
 * credit note, which is a different document with its own number and its own
 * audit trail — quietly flipping this one to CANCELLED would lose the fact that
 * a payment was received.
 */
export async function cancelInvoice(
  id: string,
  reason: string,
  actorId: string,
): Promise<Result<null>> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "INVALID", detail: "Give a reason for cancelling." };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { status: true, invoiceNumber: true },
  });
  if (!invoice) return { ok: false, error: "NOT_FOUND" };
  if (invoice.status === "PAID") return { ok: false, error: "ALREADY_PAID" };

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: trimmed },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "invoice.cancel",
        entityType: "Invoice",
        entityId: id,
        after: { invoiceNumber: invoice.invoiceNumber, reason: trimmed },
      },
    }),
  ]);

  return { ok: true, data: null };
}

/** Drafts are the only editable state, so deletion is confined to them. */
export async function deleteDraft(id: string): Promise<Result<null>> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!invoice) return { ok: false, error: "NOT_FOUND" };
  if (invoice.status !== "DRAFT") return { ok: false, error: "NOT_DRAFT" };

  await prisma.invoice.delete({ where: { id } });
  return { ok: true, data: null };
}

/** INV-YYYY-NNNNNN, matching the certificate numbering in §11.3. */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const latest = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const sequence = latest?.invoiceNumber
    ? Number.parseInt(latest.invoiceNumber.slice(prefix.length), 10) + 1
    : 1;

  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, contactEmail: true } },
      createdBy: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      lines: { orderBy: { position: "asc" }, include: { course: { select: { title: true } } } },
    },
  });
}

export async function listInvoices(organizationId?: string) {
  return prisma.invoice.findMany({
    where: organizationId ? { organizationId } : {},
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, invoiceNumber: true, status: true, billToName: true,
      totalMinor: true, currency: true, issuedAt: true, dueAt: true,
      paidAt: true, createdAt: true,
      organization: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
}

/**
 * What corporate billing is worth, for the admin overview.
 *
 * Outstanding counts issued-but-unpaid, which is the number that matters when
 * deciding whether to chase anyone. Overdue is the subset past its due date.
 */
export async function getInvoiceSummary() {
  const now = new Date();

  const [paid, outstanding, overdue] = await Promise.all([
    prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { totalMinor: true }, _count: true }),
    prisma.invoice.aggregate({ where: { status: "ISSUED" }, _sum: { totalMinor: true }, _count: true }),
    prisma.invoice.aggregate({
      where: { status: "ISSUED", dueAt: { lt: now } },
      _sum: { totalMinor: true },
      _count: true,
    }),
  ]);

  return {
    paidMinor: paid._sum.totalMinor ?? 0,
    paidCount: paid._count,
    outstandingMinor: outstanding._sum.totalMinor ?? 0,
    outstandingCount: outstanding._count,
    overdueMinor: overdue._sum.totalMinor ?? 0,
    overdueCount: overdue._count,
  };
}
