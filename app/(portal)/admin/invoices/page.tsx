import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Banknote, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getInvoiceSummary, listInvoices } from "@/lib/invoices";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { InvoiceForm } from "@/components/admin/invoice-form";
import { InvoiceStatusBadge } from "@/components/admin/invoice-status-badge";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** Corporate invoicing (PRD §13.2). */
export default async function InvoicesPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/invoices");

  const [invoices, summary, organizations, courses] = await Promise.all([
    listInvoices(),
    getInvoiceSummary(),
    prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, priceMinor: true },
    }),
  ]);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Invoices</h1>
        <p className="mt-1.5 text-muted-foreground">
          For customers who pay by transfer rather than by card. An institution buying training for
          two hundred staff needs a document to raise a purchase order against.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Banknote}
          label="Paid"
          value={naira.format(summary.paidMinor / 100)}
          hint={`${summary.paidCount} invoice${summary.paidCount === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={Clock}
          label="Outstanding"
          value={naira.format(summary.outstandingMinor / 100)}
          hint={`${summary.outstandingCount} awaiting payment`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={naira.format(summary.overdueMinor / 100)}
          hint={summary.overdueCount > 0 ? "Past the due date" : "Nothing overdue"}
          tone="alert"
        />
      </div>

      {organizations.length === 0 ? (
        <Panel title="New invoice">
          <EmptyState>
            Invoices are raised against an organisation.{" "}
            <Link href="/admin/organizations" className="font-medium text-brand hover:underline">
              Create one first
            </Link>
            .
          </EmptyState>
        </Panel>
      ) : (
        <InvoiceForm organizations={organizations} courses={courses} />
      )}

      <Panel title="All invoices">
        {invoices.length === 0 ? (
          <EmptyState>No invoices yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-3 font-medium">Number</th>
                  <th className="px-2 py-3 font-medium">Customer</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                  <th className="px-2 py-3 font-medium">Due</th>
                  <th className="px-2 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => {
                  const overdue =
                    invoice.status === "ISSUED" && invoice.dueAt !== null && invoice.dueAt < new Date();

                  return (
                    <tr key={invoice.id}>
                      <td className="px-2 py-3">
                        <Link
                          href={`/admin/invoices/${invoice.id}`}
                          className="font-mono text-xs font-medium transition hover:text-brand"
                        >
                          {invoice.invoiceNumber ?? "draft"}
                        </Link>
                      </td>
                      <td className="px-2 py-3">{invoice.billToName}</td>
                      <td className="px-2 py-3">
                        <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {invoice.dueAt
                          ? invoice.dueAt.toLocaleDateString("en-NG", { dateStyle: "medium" })
                          : "On receipt"}
                      </td>
                      <td className="px-2 py-3 text-right font-medium">
                        {naira.format(invoice.totalMinor / 100)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
