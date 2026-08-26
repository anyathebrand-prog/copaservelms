import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";
import { getPaymentsOverview } from "@/lib/payments";
import { availableProviders } from "@/lib/payments/provider";
import { StatCard } from "@/components/student/stat-card";

export const metadata: Metadata = { title: "Payments" };

const FILTERS = ["ALL", "SUCCESSFUL", "PENDING", "FAILED", "REFUNDED"] as const;

const naira = (minor: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(minor / 100);

/** Admin payments and revenue (PRD §13.2). */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/payments");
  const { status = "ALL" } = await searchParams;

  const overview = await getPaymentsOverview(
    status === "ALL" ? undefined : (status as "PENDING" | "SUCCESSFUL" | "FAILED" | "REFUNDED"),
  );
  const providers = availableProviders();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Payments</h1>
      </header>

      {providers.length === 0 && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
          No payment provider is configured, so paid courses cannot be bought. Set{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">PAYSTACK_SECRET_KEY</code> or{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">FLUTTERWAVE_SECRET_KEY</code>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Gross revenue" value={naira(overview.grossMinor)} />
        <StatCard label="Refunded" value={naira(overview.refundedMinor)} />
        <StatCard
          label="Net"
          value={naira(overview.netMinor)}
          hint={`${overview.successfulCount} successful payments`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`/admin/payments?status=${filter}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              status === filter ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
            }`}
          >
            {filter.toLowerCase()}
          </Link>
        ))}
      </div>

      {overview.payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No payments in this state.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 font-medium">Course</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs">{payment.reference}</p>
                    <p className="text-xs text-muted-foreground">{payment.provider.toLowerCase()}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p>
                      {payment.user.profile?.firstName} {payment.user.profile?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{payment.user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{payment.course?.title ?? "—"}</td>
                  <td className="px-5 py-3 font-medium">{naira(payment.amountMinor)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        payment.status === "SUCCESSFUL"
                          ? "bg-success/10 text-success"
                          : payment.status === "FAILED"
                            ? "bg-danger/10 text-danger"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {payment.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
