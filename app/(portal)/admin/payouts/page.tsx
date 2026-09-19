import type { Metadata } from "next";
import { Banknote, Clock, Hourglass, Users } from "lucide-react";
import { requireRole } from "@/lib/roles";
import {
  HOLD_DAYS,
  INSTRUCTOR_SHARE_BPS,
  MIN_PAYOUT_MINOR,
  formatNaira,
  listInstructorBalances,
  listPayouts,
} from "@/lib/earnings";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelPayoutAction, createPayoutAction, markPayoutPaidAction } from "./actions";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

/**
 * Paying instructors.
 *
 * Three steps, each deliberate. Prepare a payout, which fixes the amount and
 * the account; make the bank transfer, outside this system; then record it as
 * paid with the transfer reference. Money is never marked sent until someone
 * says they sent it, and a prepared payout can still be cancelled if the
 * transfer did not happen.
 */
export default async function PayoutsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/payouts");

  const [instructors, payouts] = await Promise.all([listInstructorBalances(), listPayouts()]);
  const pending = payouts.filter((payout) => payout.status === "PENDING");
  const ready = instructors.filter((i) => i.balance.payable && i.payoutAccount);

  const totals = instructors.reduce(
    (sum, i) => ({
      held: sum.held + i.balance.heldMinor,
      available: sum.available + Math.max(i.balance.availableMinor, 0),
      paid: sum.paid + i.balance.paidMinor,
    }),
    { held: 0, available: 0, paid: 0 },
  );

  const name = (i: { email: string; profile: { firstName: string | null; lastName: string | null } | null }) =>
    [i.profile?.firstName, i.profile?.lastName].filter(Boolean).join(" ") || i.email;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Payouts</h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          Instructors keep {INSTRUCTOR_SHARE_BPS / 100}% of each sale. Sales are held for {HOLD_DAYS}{" "}
          days, and an instructor is paid once their available balance reaches{" "}
          {formatNaira(MIN_PAYOUT_MINOR)}.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Ready to pay" value={ready.length} hint={ready.length ? "see below" : undefined} />
        <StatCard icon={Hourglass} label="Held" value={formatNaira(totals.held)} />
        <StatCard icon={Clock} label="Available" value={formatNaira(totals.available)} />
        <StatCard icon={Banknote} label="Paid out" value={formatNaira(totals.paid)} />
      </div>

      {pending.length > 0 && (
        <Panel title="Waiting for the transfer">
          <p className="mb-4 text-sm text-muted-foreground">
            Send each of these from the bank, then record the transfer reference here. Only mark a
            payout paid once the money has actually gone.
          </p>
          <ul className="divide-y divide-border">
            {pending.map((payout) => (
              <li key={payout.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-xl font-bold">{formatNaira(payout.amountMinor)}</p>
                  <p className="text-sm text-muted-foreground">{name(payout.instructor)}</p>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Bank</dt><dd>{payout.bankName}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-mono">{payout.accountNumber}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Account name</dt><dd>{payout.accountName}</dd></div>
                </dl>
                <div className="flex flex-wrap items-end gap-3">
                  <form action={markPayoutPaidAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="payoutId" value={payout.id} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium">Transfer reference</span>
                      <input
                        name="reference"
                        required
                        maxLength={120}
                        className="w-56 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                      />
                    </label>
                    <SubmitButton
                      pendingLabel="Saving..."
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      Mark paid
                    </SubmitButton>
                  </form>
                  <form action={cancelPayoutAction}>
                    <input type="hidden" name="payoutId" value={payout.id} />
                    <SubmitButton
                      pendingLabel="Cancelling..."
                      className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                    >
                      Cancel
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Instructors">
        {instructors.length === 0 ? (
          <EmptyState>No instructor has made a sale yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Instructor</th>
                  <th className="py-2 pr-4 font-medium">Held</th>
                  <th className="py-2 pr-4 font-medium">Available</th>
                  <th className="py-2 pr-4 font-medium">Paid</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {instructors.map((instructor) => (
                  <tr key={instructor.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{name(instructor)}</p>
                      <p className="text-xs text-muted-foreground">
                        {instructor.payoutAccount
                          ? `${instructor.payoutAccount.bankName} ••••${instructor.payoutAccount.accountNumber.slice(-4)}`
                          : "no bank details yet"}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatNaira(instructor.balance.heldMinor)}</td>
                    <td className={`py-3 pr-4 font-medium ${instructor.balance.availableMinor < 0 ? "text-warning" : ""}`}>
                      {formatNaira(instructor.balance.availableMinor)}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatNaira(instructor.balance.paidMinor)}</td>
                    <td className="py-3 text-right">
                      {instructor.balance.payable && instructor.payoutAccount ? (
                        <form action={createPayoutAction}>
                          <input type="hidden" name="instructorId" value={instructor.id} />
                          <SubmitButton
                            pendingLabel="Preparing..."
                            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                          >
                            Prepare payout
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {!instructor.payoutAccount
                            ? "needs bank details"
                            : instructor.balance.availableMinor < 0
                              ? "refund owed"
                              : `below ${formatNaira(MIN_PAYOUT_MINOR)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="History">
        {payouts.filter((p) => p.status !== "PENDING").length === 0 ? (
          <EmptyState>Nothing paid out yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {payouts
              .filter((payout) => payout.status !== "PENDING")
              .map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">
                      {formatNaira(payout.amountMinor)} · {name(payout.instructor)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payout.bankName} ••••{payout.accountNumber.slice(-4)} ·{" "}
                      {(payout.paidAt ?? payout.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {payout.status === "PAID" ? `paid · ref ${payout.reference}` : "cancelled"}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
