import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { getInvoice } from "@/lib/invoices";

/**
 * GET /admin/invoices/:id/pdf
 *
 * Rendered on demand rather than stored. An invoice is small, its content is
 * entirely derived from the row, and generating it fresh means a settings
 * change — a new bank account, say — is reflected the next time anyone opens
 * one, instead of leaving stale copies to be found later.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { invoiceId } = await params;
  const [invoice, pdf] = await Promise.all([getInvoice(invoiceId), renderInvoicePdf(invoiceId)]);

  if (!invoice || !pdf) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const name = invoice.invoiceNumber ?? `draft-${invoiceId.slice(0, 8)}`;

  return new NextResponse(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      // Bank details and totals: never let a shared cache hold this.
      "Cache-Control": "private, no-store",
    },
  });
}
