import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getInvoice } from "@/lib/invoices";
import { getSettings } from "@/lib/settings";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { InvoiceStatusBadge } from "@/components/admin/invoice-status-badge";
import {
  cancelInvoiceAction,
  deleteDraftAction,
  issueInvoiceAction,
  markPaidAction,
} from "../actions";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  await requireRole(["ADMIN", "SUPER_ADMIN"], `/admin/invoices/${invoiceId}`);

  const [invoice, settings] = await Promise.all([getInvoice(invoiceId), getSettings()]);
  if (!invoice) notFound();

  const overdue =
    invoice.status === "ISSUED" && invoice.dueAt !== null && invoice.dueAt < new Date();
  const bankConfigured = Boolean(settings.bankAccountNumber && settings.bankName);

  return (
    <div className="space-y-7">
      <header>
        <Link href="/admin/invoices" className="text-sm text-muted-foreground hover:text-foreground">
          ← Invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {invoice.invoiceNumber ?? "Draft invoice"}
          </h1>
          <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
        </div>
        <p className="mt-1.5 text-muted-foreground">
          {invoice.billToName}
          {invoice.organization ? (
            <>
              {" · "}
              <Link
                href={`/admin/organizations/${invoice.organization.id}`}
                className="text-brand hover:underline"
              >
                open organisation
              </Link>
            </>
          ) : null}
        </p>
      </header>

      {invoice.status === "DRAFT" && !bankConfigured && (
        <p className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm text-warning">
          No bank details are set, so this invoice will tell the customer what they owe but not
          where to send it.{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Add them in settings
          </Link>
          .
        </p>
      )}

      <Panel title="Lines">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Unit</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-2 py-3">
                    {line.description}
                    {line.course && (
                      <span className="ml-2 text-xs text-muted-foreground">({line.course.title})</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">{line.quantity}</td>
                  <td className="px-2 py-3 text-right text-muted-foreground">
                    {naira.format(line.unitAmountMinor / 100)}
                  </td>
                  <td className="px-2 py-3 text-right font-medium">
                    {naira.format(line.amountMinor / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-5 ml-auto max-w-xs space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{naira.format(invoice.subtotalMinor / 100)}</dd>
          </div>
          {invoice.discountMinor > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>-{naira.format(invoice.discountMinor / 100)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
            <dt>Total</dt>
            <dd className="text-brand">{naira.format(invoice.totalMinor / 100)}</dd>
          </div>
        </dl>

        {invoice.notes && (
          <p className="mt-5 rounded-xl bg-surface-muted p-4 text-sm text-muted-foreground">
            {invoice.notes}
          </p>
        )}
      </Panel>

      <div className="flex flex-wrap gap-3">
        <a
          href={`/admin/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
        >
          <Download className="size-4" />
          {invoice.status === "DRAFT" ? "Preview PDF" : "Download PDF"}
        </a>

        {invoice.status === "DRAFT" && (
          <>
            <form action={issueInvoiceAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <SubmitButton
                pendingLabel="Issuing..."
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Issue invoice
              </SubmitButton>
            </form>

            <form action={deleteDraftAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <SubmitButton
                pendingLabel="Deleting..."
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                Delete draft
              </SubmitButton>
            </form>
          </>
        )}
      </div>

      {invoice.status === "ISSUED" && (
        <Panel title="Record payment">
          <p className="mb-4 text-sm text-muted-foreground">
            The bank reference is required. An invoice marked paid with nothing tying it to a
            statement is a claim, not a record.
          </p>
          <form action={markPaidAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label className="min-w-56 flex-1">
              <span className="mb-1.5 block text-sm font-medium">Bank reference</span>
              <input
                name="paymentReference"
                required
                placeholder="The reference on the transfer"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Date received</span>
              <input
                type="date"
                name="paidAt"
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>
            <SubmitButton
              pendingLabel="Recording..."
              className="rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Mark paid
            </SubmitButton>
          </form>
        </Panel>
      )}

      {invoice.status === "PAID" && (
        <Panel title="Payment">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Received</dt>
              <dd className="mt-1 font-medium">
                {invoice.paidAt?.toLocaleDateString("en-NG", { dateStyle: "long" })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Reference</dt>
              <dd className="mt-1 font-mono text-xs">{invoice.paymentReference}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-muted-foreground">
            Enrolment is granted separately, so the right people are chosen deliberately — use{" "}
            <Link href="/admin/cohorts" className="font-medium text-brand hover:underline">
              cohorts
            </Link>{" "}
            or bulk enrol on the organisation page.
          </p>
        </Panel>
      )}

      {invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
        <Panel title="Cancel">
          <form action={cancelInvoiceAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label className="min-w-56 flex-1">
              <span className="mb-1.5 block text-sm font-medium">Reason</span>
              <input
                name="reason"
                required
                placeholder="Why this invoice is being withdrawn"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>
            <SubmitButton
              pendingLabel="Cancelling..."
              className="rounded-lg border border-danger/30 px-5 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
            >
              Cancel invoice
            </SubmitButton>
          </form>
        </Panel>
      )}

      {invoice.status === "CANCELLED" && invoice.cancelReason && (
        <p className="rounded-xl border border-border bg-surface-muted px-5 py-4 text-sm text-muted-foreground">
          Cancelled {invoice.cancelledAt?.toLocaleDateString("en-NG", { dateStyle: "long" })} —{" "}
          {invoice.cancelReason}
        </p>
      )}
    </div>
  );
}
