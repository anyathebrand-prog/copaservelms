"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  cancelInvoice,
  createDraft,
  deleteDraft,
  issueInvoice,
  markPaid,
  type InvoiceError,
  type LineInput,
} from "@/lib/invoices";

/** Corporate invoicing (PRD §13.2). */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

const MESSAGES: Record<InvoiceError, string> = {
  NOT_FOUND: "That invoice no longer exists.",
  INVALID: "That invoice is not valid.",
  NOT_DRAFT: "Only a draft can be changed. Cancel this one and raise a new invoice instead.",
  NOT_ISSUED: "Issue the invoice before recording a payment against it.",
  ALREADY_PAID: "That invoice is already paid. Reversing it needs a credit note, not a cancellation.",
};

/**
 * Read line items out of the form.
 *
 * Naira in the form, kobo in the database: the conversion happens once, here,
 * so nothing downstream has to wonder which unit it is holding.
 */
function readLines(formData: FormData): LineInput[] {
  const descriptions = formData.getAll("description") as string[];
  const quantities = formData.getAll("quantity") as string[];
  const prices = formData.getAll("unitAmount") as string[];
  const courses = formData.getAll("lineCourseId") as string[];

  return descriptions
    .map((description, index) => ({
      description,
      courseId: courses[index] || null,
      quantity: Number.parseInt(quantities[index] ?? "1", 10) || 0,
      unitAmountMinor: Math.round(Number.parseFloat(prices[index] ?? "0") * 100) || 0,
    }))
    .filter((line) => line.description.trim().length > 0);
}

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const dueAt = String(formData.get("dueAt") ?? "").trim();

  const result = await createDraft(
    {
      organizationId: String(formData.get("organizationId") ?? ""),
      lines: readLines(formData),
      discountMinor: Math.round(Number.parseFloat(String(formData.get("discount") ?? "0")) * 100) || 0,
      notes: String(formData.get("notes") ?? ""),
      dueAt: dueAt ? new Date(dueAt) : null,
    },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${result.data.id}`);
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("invoiceId") ?? "");

  const result = await issueInvoice(id, user.id);
  if (!result.ok) throw new Error(MESSAGES[result.error]);

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("invoiceId") ?? "");
  const paidAt = String(formData.get("paidAt") ?? "").trim();

  const result = await markPaid(
    id,
    {
      paymentReference: String(formData.get("paymentReference") ?? ""),
      paidAt: paidAt ? new Date(paidAt) : undefined,
    },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin");
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("invoiceId") ?? "");

  const result = await cancelInvoice(id, String(formData.get("reason") ?? ""), user.id);
  if (!result.ok) throw new Error(result.detail ?? MESSAGES[result.error]);

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function deleteDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const result = await deleteDraft(String(formData.get("invoiceId") ?? ""));
  if (!result.ok) throw new Error(MESSAGES[result.error]);

  revalidatePath("/admin/invoices");
  redirect("/admin/invoices");
}
