import type { Metadata } from "next";
import { Download, MailCheck, Users, UserX } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getWaitlistSummary, listWaitlist } from "@/lib/waitlist";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { markInvitedAction } from "./actions";

export const metadata: Metadata = { title: "Waitlist" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-brand-pale text-brand",
  INVITED: "bg-warning/10 text-warning",
  JOINED: "bg-success/10 text-success",
  UNSUBSCRIBED: "bg-muted-foreground/10 text-muted-foreground",
};

/** Pre-launch waitlist (PRD §7.2). */
export default async function WaitlistPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/waitlist");

  const [entries, summary] = await Promise.all([listWaitlist(), getWaitlistSummary()]);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Waitlist</h1>
          <p className="mt-1.5 text-muted-foreground">
            People who asked to hear when CopaServe opens.
          </p>
        </div>

        <a
          href="/admin/waitlist/export"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
        >
          <Download className="size-4" />
          Export CSV
        </a>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Waiting" value={summary.pending} />
        <StatCard icon={MailCheck} label="Invited" value={summary.invited} />
        <StatCard icon={Users} label="Joined" value={summary.joined} hint="signed up for real" />
        <StatCard
          icon={UserX}
          label="Unsubscribed"
          value={summary.unsubscribed}
          hint={summary.unsubscribed > 0 ? "suppressed, never re-import" : undefined}
        />
      </div>

      {summary.thisWeek > 0 && (
        <p className="text-sm text-muted-foreground">
          {summary.thisWeek} signed up in the last seven days.
        </p>
      )}

      <Panel title="Everyone on the list">
        {entries.length === 0 ? (
          <EmptyState>
            Nobody yet. The form is at the bottom of the landing page.
          </EmptyState>
        ) : (
          <form action={markInvitedAction}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-3 font-medium"></th>
                    <th className="px-2 py-3 font-medium">Email</th>
                    <th className="px-2 py-3 font-medium">Name</th>
                    <th className="px-2 py-3 font-medium">Organisation</th>
                    <th className="px-2 py-3 font-medium">Interest</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Joined list</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          name="entryId"
                          value={entry.id}
                          disabled={entry.status !== "PENDING"}
                          aria-label={`Select ${entry.email}`}
                          className="size-4 accent-[#0a510e] disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-3 font-medium">{entry.email}</td>
                      <td className="px-2 py-3 text-muted-foreground">{entry.name ?? "—"}</td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {entry.organisation ?? "—"}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">{entry.interest ?? "—"}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            STATUS_STYLES[entry.status] ?? ""
                          }`}
                        >
                          {entry.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {entry.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <SubmitButton
                pendingLabel="Marking..."
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Mark selected as invited
              </SubmitButton>
              <p className="text-sm text-muted-foreground">
                Marks who you have reached out to. It does not send anything — email is still
                waiting on the domain.
              </p>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
