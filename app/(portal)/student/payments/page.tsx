import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getPaymentsForUser } from "@/lib/payments";

export const metadata: Metadata = { title: "Payments" };

const BANNERS: Record<string, { tone: string; message: string }> = {
  success: { tone: "bg-success/10 text-success", message: "Payment confirmed — you are enrolled." },
  pending: {
    tone: "bg-warning/10 text-warning",
    message: "Payment is still processing. Enrolment opens as soon as your provider confirms it.",
  },
  failed: {
    tone: "bg-danger/10 text-danger",
    message: "That payment did not go through. Nothing was charged.",
  },
  missing: { tone: "bg-danger/10 text-danger", message: "We could not identify that payment." },
};

/** Payment history and the landing spot after a provider redirect. */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser("/student/payments");
  const { status } = await searchParams;
  const payments = await getPaymentsForUser(user.id);
  const banner = status ? BANNERS[status] : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Payments</h1>
      </header>

      {banner && <p className={`rounded-lg px-4 py-3 text-sm ${banner.tone}`}>{banner.message}</p>}

      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No payments yet.{" "}
          <Link href="/courses" className="font-medium text-brand hover:underline">
            Browse courses
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
            >
              <div className="min-w-0">
                <p className="font-medium">{payment.course?.title ?? "Course"}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{payment.reference}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {payment.provider.toLowerCase()} ·{" "}
                  {(payment.paidAt ?? payment.createdAt).toLocaleDateString("en-NG", {
                    dateStyle: "medium",
                  })}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-semibold">
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: payment.currency,
                    maximumFractionDigits: 0,
                  }).format(payment.amountMinor / 100)}
                </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
