import type { Metadata } from "next";
import { Banknote, Clock, Hourglass, Wallet } from "lucide-react";
import { requireRole } from "@/lib/roles";
import {
  HOLD_DAYS,
  INSTRUCTOR_SHARE_BPS,
  MIN_PAYOUT_MINOR,
  formatNaira,
  getBalance,
  getPayoutAccount,
  listEarnings,
  listPayouts,
} from "@/lib/earnings";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { savePayoutAccountAction } from "./actions";

export const metadata: Metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Earned",
  IN_PAYOUT: "Being paid",
  PAID: "Paid",
  VOID: "Refunded",
};

const dateOf = (d: Date) => d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

/**
 * What an instructor has earned, what is held, and what has been paid.
 *
 * The three numbers are kept apart on purpose. "You have earned ₦40,000" and
 * "you can be paid ₦40,000" are different statements for the first month of
 * any sale, and conflating them is how an instructor ends up asking where
 * money is that was never due yet.
 */
export default async function EarningsPage() {
  const user = await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor/earnings");

  const [balance, account, earnings, payouts] = await Promise.all([
    getBalance(user.id),
    getPayoutAccount(user.id),
    listEarnings(user.id),
    listPayouts(user.id),
  ]);

  const share = INSTRUCTOR_SHARE_BPS / 100;
  const toMinimum = Math.max(MIN_PAYOUT_MINOR - balance.availableMinor, 0);
  const progress = Math.min(Math.max(balance.availableMinor / MIN_PAYOUT_MINOR, 0), 1);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Earnings</h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          You keep {share}% of what learners pay for your courses. Each sale is held for {HOLD_DAYS}{" "}
          days in case of a refund, then counts towards your next payout, which is made once you
          reach {formatNaira(MIN_PAYOUT_MINOR)}.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Hourglass}
          label="Held"
          value={formatNaira(balance.heldMinor)}
          hint={balance.nextReleaseAt ? `next unlocks ${dateOf(balance.nextReleaseAt)}` : undefined}
        />
        <StatCard
          icon={Wallet}
          label="Available"
          value={formatNaira(balance.availableMinor)}
          hint={balance.payable ? "ready to be paid" : `${formatNaira(toMinimum)} to go`}
        />
        <StatCard icon={Clock} label="Being paid" value={formatNaira(balance.inPayoutMinor)} />
        <StatCard icon={Banknote} label="Paid to you" value={formatNaira(balance.paidMinor)} />
      </div>

      {/* A refund after payout can leave this below zero; say so, rather than
          show a negative number and let someone assume an error. */}
      {balance.availableMinor < 0 ? (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
          A refund on a sale you were already paid for comes off your next payout. Your next{" "}
          {formatNaira(-balance.availableMinor)} of earnings covers it.
        </p>
      ) : (
        !balance.payable && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatNaira(balance.availableMinor)} of the {formatNaira(MIN_PAYOUT_MINOR)} minimum
            </p>
          </div>
        )
      )}

      <Panel title="Where to pay you">
        {!account && (
          <p className="mb-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            Add your bank details so we can pay you once you reach the minimum.
          </p>
        )}
        <form action={savePayoutAccountAction} className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Bank</span>
            <input
              name="bankName"
              required
              maxLength={80}
              defaultValue={account?.bankName ?? ""}
              placeholder="e.g. GTBank"
              className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Account number</span>
            <input
              name="accountNumber"
              required
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              defaultValue={account?.accountNumber ?? ""}
              placeholder="10 digits"
              className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Account name</span>
            <input
              name="accountName"
              required
              maxLength={120}
              defaultValue={account?.accountName ?? ""}
              placeholder="As the bank has it"
              className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
          <div className="sm:col-span-3">
            <SubmitButton
              pendingLabel="Saving..."
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {account ? "Update bank details" : "Save bank details"}
            </SubmitButton>
            <p className="mt-2 text-xs text-muted-foreground">
              Payments go to this account in your name. A payout already on its way keeps the
              details it was sent with.
            </p>
          </div>
        </form>
      </Panel>

      <Panel title="Payouts">
        {payouts.length === 0 ? (
          <EmptyState>No payouts yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {payouts.map((payout) => (
              <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{formatNaira(payout.amountMinor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {payout.bankName} ••••{payout.accountNumber.slice(-4)} ·{" "}
                    {dateOf(payout.paidAt ?? payout.createdAt)}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {payout.status === "PAID"
                    ? `Paid · ref ${payout.reference}`
                    : payout.status === "PENDING"
                      ? "On its way"
                      : "Cancelled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sales">
        {earnings.length === 0 ? (
          <EmptyState>When a learner pays for one of your courses, it appears here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Course</th>
                  <th className="py-2 pr-4 font-medium">Paid</th>
                  <th className="py-2 pr-4 font-medium">Your share</th>
                  <th className="py-2 pr-4 font-medium">Available</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {earnings.map((earning) => (
                  <tr key={earning.id}>
                    <td className="py-2.5 pr-4">
                      {earning.payment.course?.title ?? "—"}
                      {earning.kind === "REFUND" && (
                        <span className="ml-2 text-xs text-warning">refund</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatNaira(earning.grossMinor)}</td>
                    <td className={`py-2.5 pr-4 font-medium ${earning.shareMinor < 0 ? "text-warning" : ""}`}>
                      {formatNaira(earning.shareMinor)}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{dateOf(earning.availableAt)}</td>
                    <td className="py-2.5 text-xs">{STATUS_LABEL[earning.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
