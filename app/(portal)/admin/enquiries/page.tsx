import type { Metadata } from "next";
import { CheckCircle2, Clock, Inbox } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getEnquirySummary, listEnquiries } from "@/lib/enquiries";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { setEnquiryStatusAction } from "./actions";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-pale text-brand",
  IN_PROGRESS: "bg-warning/10 text-warning",
  CLOSED: "bg-muted-foreground/10 text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
};

/**
 * Corporate enquiries from /contact.
 *
 * Ordered with the unanswered first, because the only failure mode that matters
 * here is an enquiry nobody replied to. Who moved it and when is shown for the
 * same reason: a shared inbox with no ownership is how one prospect gets three
 * replies and another gets none.
 */
export default async function EnquiriesPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/enquiries");

  const [enquiries, summary] = await Promise.all([listEnquiries(), getEnquirySummary()]);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Enquiries</h1>
        <p className="mt-1.5 text-muted-foreground">
          Organisations who wrote in from the contact page.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Inbox}
          label="New"
          value={summary.NEW}
          hint={summary.NEW > 0 ? "nobody has replied yet" : undefined}
        />
        <StatCard icon={Clock} label="In progress" value={summary.IN_PROGRESS} />
        <StatCard icon={CheckCircle2} label="Closed" value={summary.CLOSED} />
      </div>

      <Panel title="Everything that has come in">
        {enquiries.length === 0 ? (
          <EmptyState>
            Nothing yet. The form is at <span className="font-medium">/contact</span>, linked from
            the &ldquo;Talk to us&rdquo; button on the landing page.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {enquiries.map((enquiry) => {
              const handler =
                enquiry.handledBy?.profile?.displayName ?? enquiry.handledBy?.profile?.firstName;

              return (
                <li key={enquiry.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {enquiry.name}
                        {enquiry.organisation && (
                          <span className="text-muted-foreground"> · {enquiry.organisation}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {/* A mailto here is fine: this page is behind admin auth,
                            which is the difference between a working reply link
                            and an address published for scrapers. */}
                        <a
                          href={`mailto:${enquiry.email}?subject=${encodeURIComponent("Re: your CopaServe enquiry")}`}
                          className="text-brand hover:underline"
                        >
                          {enquiry.email}
                        </a>
                        {enquiry.phone && <> · {enquiry.phone}</>}
                        {enquiry.staffCount && <> · {enquiry.staffCount} staff</>}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[enquiry.status]}`}
                    >
                      {STATUS_LABELS[enquiry.status]}
                    </span>
                  </div>

                  {/* Whatever they typed, rendered as text. React escapes it;
                      the wrapping is what stops a long paste breaking the page. */}
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-muted px-4 py-3 text-sm leading-relaxed">
                    {enquiry.message}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span>{enquiry.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                    {enquiry.source && <span>via {enquiry.source}</span>}
                    {handler && enquiry.handledAt && (
                      <span>
                        {handler} · {enquiry.handledAt.toISOString().slice(0, 10)}
                      </span>
                    )}

                    <span className="ml-auto flex gap-2">
                      {(["NEW", "IN_PROGRESS", "CLOSED"] as const)
                        .filter((status) => status !== enquiry.status)
                        .map((status) => (
                          <form key={status} action={setEnquiryStatusAction}>
                            <input type="hidden" name="enquiryId" value={enquiry.id} />
                            <input type="hidden" name="status" value={status} />
                            <SubmitButton
                              pendingLabel="…"
                              className="rounded-lg border border-border px-3 py-1.5 font-medium transition hover:bg-surface-muted"
                            >
                              Mark {STATUS_LABELS[status].toLowerCase()}
                            </SubmitButton>
                          </form>
                        ))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
