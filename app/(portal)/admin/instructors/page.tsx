import type { Metadata } from "next";
import { CheckCircle2, ExternalLink, GraduationCap, XCircle } from "lucide-react";
import { requireRole } from "@/lib/roles";
import { getApplicationSummary, listApplications } from "@/lib/instructor-applications";
import { StatCard } from "@/components/student/stat-card";
import { EmptyState, Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { approveApplicationAction, declineApplicationAction } from "./actions";

export const metadata: Metadata = { title: "Instructor applications" };
export const dynamic = "force-dynamic";

/** Approving instructors (PRD §13.2). */
export default async function InstructorApplicationsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/instructors");

  const [applications, summary] = await Promise.all([listApplications(), getApplicationSummary()]);
  const pending = applications.filter((a) => a.status === "PENDING");
  const decided = applications.filter((a) => a.status !== "PENDING");

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Instructor applications
        </h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          Approving one grants the INSTRUCTOR role and lets that person author courses that end in
          a certificate. Declining sends them the reason you give.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={GraduationCap}
          label="Waiting on you"
          value={summary.pending}
          tone="alert"
        />
        <StatCard icon={CheckCircle2} label="Approved" value={summary.approved} />
        <StatCard icon={XCircle} label="Declined" value={summary.declined} />
      </div>

      <Panel title="Waiting">
        {pending.length === 0 ? (
          <EmptyState>Nobody is waiting.</EmptyState>
        ) : (
          <ul className="space-y-5">
            {pending.map((application) => {
              const name =
                `${application.user.profile?.firstName ?? ""} ${application.user.profile?.lastName ?? ""}`.trim() ||
                application.user.email;

              return (
                <li key={application.id} className="rounded-2xl border border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">{application.user.email}</p>
                      {(application.user.profile?.profession ||
                        application.user.profile?.organizationName) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            application.user.profile?.profession,
                            application.user.profile?.organizationName,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {application.submittedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    </p>
                  </div>

                  <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                        Would teach
                      </dt>
                      <dd className="mt-1 font-medium">{application.expertise}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                        Background
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {application.background}
                      </dd>
                    </div>
                    {application.link && (
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                          Link
                        </dt>
                        <dd className="mt-1">
                          <a
                            href={application.link}
                            target="_blank"
                            rel="noreferrer nofollow"
                            className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
                          >
                            {application.link}
                            <ExternalLink className="size-3.5" />
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                    <form action={approveApplicationAction}>
                      <input type="hidden" name="applicationId" value={application.id} />
                      <SubmitButton
                        pendingLabel="Approving..."
                        className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Approve and grant instructor
                      </SubmitButton>
                    </form>

                    <form action={declineApplicationAction} className="flex gap-2">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input
                        name="note"
                        required
                        placeholder="Reason, which they will see"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                      />
                      <SubmitButton
                        pendingLabel="…"
                        className="shrink-0 rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
                      >
                        Decline
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {decided.length > 0 && (
        <Panel title="Decided">
          <ul className="divide-y divide-border">
            {decided.map((application) => (
              <li key={application.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{application.user.email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {application.expertise}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    application.status === "APPROVED"
                      ? "bg-success/10 text-success"
                      : "bg-muted-foreground/10 text-muted-foreground"
                  }`}
                >
                  {application.status.toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {application.reviewedBy?.email ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
